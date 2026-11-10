/**
 * Digital asset library — the I/O. Rules live in ./core.ts.
 *
 * Every picture enters through ingestAsset(): verified, turned upright,
 * stripped of camera/GPS metadata, thumbnailed, colour-sampled, hashed
 * (an exact duplicate returns the existing asset), stored in R2, then
 * captioned and tagged by AI after the response is sent.
 */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { deleteR2ObjectByUrl, putR2Object, r2, R2_BUCKET, r2PublicUrl } from "@/lib/r2";
import { chat, embed, toVectorLiteral, transcribe } from "@/lib/ai";
import { hamming, inferOrigin, isPurgeable, MAX_TRANSCRIBE_BYTES, NEAR_DUPLICATE_BITS, normalizeTags, titleFromFileName, TRASH_DAYS } from "./core";
import { processImage, readProvenance, type Processed } from "./image";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

import { assetUrl, setUsage, type UsageTarget } from "./usage";
export { assetUrl, setUsage, type UsageTarget } from "./usage";

async function store(id: string, version: number, p: Processed, mimeType: string) {
  const stamp = randomUUID().slice(0, 8);
  const key = `assets/${id}/v${version}-${stamp}.${EXT[mimeType]}`;
  const thumbKey = `assets/${id}/v${version}-${stamp}-thumb.webp`;
  await putR2Object(key, p.bytes, mimeType);
  await putR2Object(thumbKey, p.thumb, "image/webp");
  return { key, thumbKey };
}

export interface IngestInput {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  folder?: string;
  tags?: string[];
  source?: string | null;
  /** Set when the platform made the file (e.g. an AI expand); otherwise read from the file. */
  origin?: string;
  actor: { id: string | null; name: string | null };
}

/** Add a picture to the library. An exact duplicate returns the asset already there. */
export async function ingestAsset(input: IngestInput): Promise<{ asset: { id: string; key: string }; duplicate: boolean }> {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const existing = await prisma.asset.findFirst({ where: { sha256, deletedAt: null, key: { not: "" } }, select: { id: true, key: true } });
  if (existing) return { asset: existing, duplicate: true };

  const provenance = await readProvenance(input.bytes);
  const p = await processImage(input.bytes, input.mimeType);
  const id = `as${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const { key, thumbKey } = await store(id, 1, p, input.mimeType);
  const asset = await prisma.asset.create({
    data: {
      id, key, thumbKey, sha256, fileName: input.fileName.slice(0, 200), title: titleFromFileName(input.fileName),
      mimeType: input.mimeType, sizeBytes: p.bytes.length, width: p.width, height: p.height, color: p.color, blur: p.blur,
      folder: input.folder ?? "General", tags: normalizeTags(input.tags ?? []), source: input.source ?? null,
      uploadedById: input.actor.id, uploadedByName: input.actor.name,
      phash: p.phash, provenance: { ...provenance }, origin: input.origin ?? inferOrigin(provenance),
    },
    select: { id: true, key: true },
  });
  after(() => enrichAsset(asset.id, p.thumb).catch((e) => console.error("asset enrich:", (e as Error).message)));
  return { asset, duplicate: false };
}

/** Replace an asset's file; the old one is kept as a version. */
export async function replaceAssetFile(id: string, bytes: Buffer, mimeType: string, actorId: string | null) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw new Error("Asset not found.");
  if (asset.locked) throw new Error("This brand asset is locked. Unlock it first.");
  const p = await processImage(bytes, mimeType);
  const next = asset.version + 1;
  const { key, thumbKey } = await store(id, next, p, mimeType);
  await prisma.$transaction([
    prisma.assetVersion.create({ data: { assetId: id, version: asset.version, key: asset.key, thumbKey: asset.thumbKey,
      sizeBytes: asset.sizeBytes, width: asset.width, height: asset.height, createdById: actorId } }),
    prisma.asset.update({ where: { id }, data: { key, thumbKey, version: next, mimeType, sizeBytes: p.bytes.length, width: p.width,
      height: p.height, color: p.color, blur: p.blur, phash: p.phash, sha256: createHash("sha256").update(bytes).digest("hex"), aiTagged: false } }),
  ]);
  after(() => enrichAsset(id, p.thumb).catch((e) => console.error("asset enrich:", (e as Error).message)));
}

// ── AI: caption, alt text, tags, search vector ─────────────────────────
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
const CF_TOKEN = process.env.CF_AI_TOKEN;
const VISION_MODELS = ["@cf/llava-hf/llava-1.5-7b-hf", "@cf/moondream/moondream3.1-9B-A2B"];

async function describe(image: Buffer): Promise<string | null> {
  if (!CF_ACCOUNT || !CF_TOKEN) return null;
  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${model}`, {
        method: "POST", headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ image: [...image], prompt: "Describe this picture in one plain sentence for alt text. Mention people, setting and any visible text.", max_tokens: 120 }),
        signal: AbortSignal.timeout(25_000),
      });
      const j = await res.json() as { success?: boolean; result?: { description?: string; response?: string } };
      const text = (j.result?.description ?? j.result?.response)?.trim();
      if (res.ok && j.success && text) return text.slice(0, 400);
    } catch { /* try the next model */ }
  }
  return null;
}

/** Caption + tags + embedding. Never overwrites what a person already typed. */
export async function enrichAsset(id: string, image?: Buffer) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return;
  const bytes = image ?? (asset.thumbKey ? Buffer.from(await (await fetch(r2PublicUrl(asset.thumbKey))).arrayBuffer()) : null);
  const caption = asset.caption ?? (bytes ? await describe(bytes) : null);
  let tags = asset.tags;
  if ((caption || asset.transcript) && tags.length < 3) {
    const r = await chat([
      { role: "system", content: "Return only a JSON array of 4 to 8 short lowercase tags (1-2 words each) for searching a photo and video library." },
      { role: "user", content: `${asset.kind === "video" ? "Video poster" : "Photo"}: ${caption}\nFile: ${asset.title}${asset.transcript ? `\nSpoken: ${asset.transcript.slice(0, 1200)}` : ""}` },
    ], { feature: "asset_tags", maxTokens: 80, temperature: 0.2 }).catch(() => null);
    const text = (r as { text?: string } | null)?.text ?? "";
    try { tags = normalizeTags([...tags, ...(JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as string[])]); } catch { /* keep */ }
  }
  await prisma.asset.update({ where: { id }, data: { caption, altText: asset.altText ?? caption, tags, aiTagged: true } });
  await embedAsset(id);
}

/** Refresh the search vector from the asset's words. */
export async function embedAsset(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, select: { title: true, caption: true, tags: true, people: true, folder: true, transcript: true } });
  if (!a) return;
  const words = [a.title, a.caption, a.tags.join(", "), a.people, a.folder, a.transcript?.slice(0, 1500)].filter(Boolean).join(". ");
  const vec = (await embed([words], { feature: "asset_search" }))?.[0];
  if (vec) await prisma.$executeRawUnsafe(`UPDATE "Asset" SET "embedding" = $1::vector WHERE "id" = $2`, toVectorLiteral(vec), id);
}

/** Asset ids closest in meaning to a search, best first. */
export async function semanticSearch(q: string, limit = 60): Promise<string[]> {
  const vec = (await embed([q], { feature: "asset_search" }))?.[0];
  if (!vec) return [];
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "Asset" WHERE "embedding" IS NOT NULL AND "deletedAt" IS NULL
       AND 1 - ("embedding" <=> $1::vector) > 0.5 ORDER BY "embedding" <=> $1::vector LIMIT ${Math.min(200, limit)}`,
    toVectorLiteral(vec),
  ).catch(() => []);
  return rows.map((r) => r.id);
}

// ── Other upload screens ──────────────────────────────────────────────
/**
 * Keep a library copy of a picture uploaded elsewhere on the platform
 * (speaker headshot, event cover, design-review artwork), linked back to
 * where it's used. Runs after the response; never fails the upload.
 */
export function libraryCopy(input: Omit<IngestInput, "source"> & { people?: string | null; usage: UsageTarget }) {
  after(async () => {
    try {
      const { asset, duplicate } = await ingestAsset({ ...input, source: input.usage.label });
      if (!duplicate && input.people) await prisma.asset.update({ where: { id: asset.id }, data: { people: input.people } });
      await setUsage(asset.id, input.usage);
    } catch (e) { console.error("library copy:", (e as Error).message); }
  });
}

// ── Look-alikes ────────────────────────────────────────────────────────
/** Pictures like this one: near-duplicates by look, then neighbours in meaning. */
export async function similarAssets(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, select: { phash: true } });
  if (!a) return { duplicates: [] as string[], similar: [] as string[] };
  // ponytail: hash comparison scans every picture in JS; fine to a few thousand, then use a BK-tree or pg extension.
  const all = a.phash ? await prisma.asset.findMany({ where: { deletedAt: null, phash: { not: null }, NOT: { id } }, select: { id: true, phash: true } }) : [];
  const duplicates = all.map((x) => ({ id: x.id, d: hamming(a.phash!, x.phash!) })).filter((x) => x.d <= NEAR_DUPLICATE_BITS).sort((x, y) => x.d - y.d).map((x) => x.id);
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT b."id" FROM "Asset" a JOIN "Asset" b ON b."id" <> a."id" AND b."embedding" IS NOT NULL AND b."deletedAt" IS NULL
      WHERE a."id" = $1 AND a."embedding" IS NOT NULL ORDER BY b."embedding" <=> a."embedding" LIMIT 12`, id,
  ).catch(() => []);
  return { duplicates, similar: rows.map((r) => r.id).filter((x) => !duplicates.includes(x)) };
}

// ── Video ──────────────────────────────────────────────────────────────
/** A short-lived URL the browser PUTs the video to directly (skips the 4.5 MB request cap). */
export async function presignVideoUpload(fileName: string, mimeType: string) {
  if (!r2) throw new Error("Storage isn't configured.");
  const id = `as${randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const ext = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[mimeType] ?? "mp4";
  const key = `assets/${id}/v1-${randomUUID().slice(0, 8)}.${ext}`;
  const url = await getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: mimeType }), { expiresIn: 900 });
  return { key, url, fileName };
}

/** Record a video already uploaded straight to storage; its poster frame comes from the browser. */
export async function registerVideo(input: { key: string; fileName: string; mimeType: string; sizeBytes: number; durationSec: number | null;
  width: number | null; height: number | null; poster: Buffer | null; folder: string; actor: { id: string | null; name: string | null } }) {
  const id = input.key.split("/")[1];
  let thumbKey: string | null = null, color: string | null = null, blur: string | null = null, phash: string | null = null;
  if (input.poster) {
    const p = await processImage(input.poster, "image/jpeg").catch(() => null);
    if (p) { thumbKey = `assets/${id}/poster.webp`; await putR2Object(thumbKey, p.thumb, "image/webp"); color = p.color; blur = p.blur; phash = p.phash; }
  }
  const asset = await prisma.asset.create({ data: {
    id, kind: "video", key: input.key, thumbKey, fileName: input.fileName.slice(0, 200), title: titleFromFileName(input.fileName),
    mimeType: input.mimeType, sizeBytes: input.sizeBytes, width: input.width, height: input.height, durationSec: input.durationSec,
    sha256: `video:${input.key}`, color, blur, phash, folder: input.folder, uploadedById: input.actor.id, uploadedByName: input.actor.name,
  }, select: { id: true } });
  after(() => transcribeVideo(asset.id).catch((e) => console.error("asset transcribe:", (e as Error).message)));
  return asset;
}

/** Whisper the video's words into a transcript (small files only), then caption, tag and index it. */
export async function transcribeVideo(id: string) {
  const a = await prisma.asset.findUnique({ where: { id }, select: { key: true, sizeBytes: true, thumbKey: true, transcript: true } });
  if (!a) return;
  if (!a.transcript && a.sizeBytes <= MAX_TRANSCRIBE_BYTES) {
    const bytes = new Uint8Array(await (await fetch(r2PublicUrl(a.key))).arrayBuffer());
    const t = await transcribe(bytes, { feature: "asset_transcript" });
    if (t.ok && t.text) await prisma.asset.update({ where: { id }, data: { transcript: t.text.slice(0, 100_000) } });
  }
  await enrichAsset(id);
}

// ── Trash ───────────────────────────────────────────────────────────────
/** Remove for good: assets trashed 30+ days ago that nothing uses. Files first, row second. */
export async function purgeTrashedAssets(now: Date = new Date()): Promise<{ removed: number }> {
  const due = await prisma.asset.findMany({
    where: { deletedAt: { lte: new Date(now.getTime() - TRASH_DAYS * 86_400_000) }, usages: { none: {} } },
    include: { versions: true }, take: 100,
  });
  let removed = 0;
  for (const a of due) {
    if (!isPurgeable(a.deletedAt, now)) continue;
    try {
      for (const k of [a.key, a.thumbKey, ...a.versions.flatMap((v) => [v.key, v.thumbKey])]) if (k) await deleteR2ObjectByUrl(k);
      await prisma.asset.delete({ where: { id: a.id } });
      removed++;
    } catch { /* one stuck file must not keep the rest */ }
  }
  return { removed };
}

// ── Shapes sent to the library page ───────────────────────────────────
type AssetRow = Awaited<ReturnType<typeof prisma.asset.findFirstOrThrow>> & { _count?: { usages: number } };
export type AssetCard = ReturnType<typeof toCard>;
export function toCard(a: AssetRow) {
  return {
    id: a.id, title: a.title, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, width: a.width, height: a.height,
    url: assetUrl(a.key)!, thumbUrl: assetUrl(a.thumbKey) ?? (a.kind === "video" ? null : assetUrl(a.key)!), blur: a.blur, color: a.color,
    folder: a.folder, tags: a.tags, caption: a.caption, altText: a.altText, aiTagged: a.aiTagged,
    people: a.people, consent: a.consent, credit: a.credit, license: a.license, source: a.source,
    expiresAt: a.expiresAt?.toISOString() ?? null, locked: a.locked, version: a.version,
    uploadedByName: a.uploadedByName, deletedAt: a.deletedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(), usageCount: a._count?.usages ?? 0,
    kind: a.kind, origin: a.origin, provenance: (a.provenance ?? null) as Record<string, unknown> | null,
    durationSec: a.durationSec, hasTranscript: !!a.transcript, downloads: a.downloads,
  };
}

/** Superadmin gate + same-origin check for writes. Returns the actor or a response to send. */
export async function assetActor(req: Request, write: boolean) {
  const { requireRole } = await import("@/lib/auth");
  const session = await requireRole("superadmin").catch(() => null);
  const user = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!user?.id) return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  const origin = req.headers.get("origin");
  if (write && origin && origin !== new URL(req.url).origin) return { error: Response.json({ error: "Invalid origin" }, { status: 403 }) } as const;
  return { actor: { id: user.id, name: user.name || user.email || "Team member" } } as const;
}

export const collectionCard = (c: { id: string; name: string; assetIds: string[]; shareToken: string | null; shareExpiresAt: Date | null; query?: unknown; views?: number }) =>
  ({ id: c.id, name: c.name, count: c.assetIds.length, assetIds: c.assetIds, shareToken: c.shareToken, shareExpiresAt: c.shareExpiresAt?.toISOString() ?? null,
    smart: !!c.query, views: c.views ?? 0 });
