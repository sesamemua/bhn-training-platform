/**
 * Bring existing pictures into the library, a batch at a time: social
 * graphics, speaker photos and event covers already in R2. The originals
 * stay where they are; each gets a library copy and a "Used in" link.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isR2PublicUrl } from "@/lib/r2";
import { assetActor, ingestAsset, setUsage, type UsageTarget } from "@/lib/assets/store";

export const runtime = "nodejs";
const BATCH = 8;

async function candidates() {
  const [posts, speakers, events, done, used] = await Promise.all([
    prisma.socialPost.findMany({ where: { assetUrl: { not: null }, status: { not: "skipped" } }, select: { id: true, assetUrl: true, assetSpec: true, stream: true } }),
    prisma.speaker.findMany({ where: { photoUrl: { not: null } }, select: { id: true, fullName: true, photoUrl: true, event: { select: { slug: true } } } }),
    prisma.bhnEvent.findMany({ where: { coverImageUrl: { not: null } }, select: { id: true, slug: true, title: true, coverImageUrl: true } }),
    prisma.asset.findMany({ where: { source: { not: null } }, select: { source: true } }),
    prisma.assetUsage.findMany({ select: { targetType: true, targetId: true } }),
  ]);
  const seen = new Set(done.map((d) => d.source));
  const linked = new Set(used.map((u) => `${u.targetType}:${u.targetId}`));
  const list: { url: string; folder: string; tags: string[]; people?: string; usage: UsageTarget }[] = [];
  for (const p of posts) if (isR2PublicUrl(p.assetUrl)) list.push({ url: p.assetUrl!, folder: "Social", tags: [p.stream],
    usage: { targetType: "socialPost", targetId: p.id, label: `Social post · ${(p.assetSpec as { title?: string } | null)?.title ?? p.stream}`, href: `/admin/workspace/marketing/social?post=${p.id}` } });
  for (const s of speakers) if (isR2PublicUrl(s.photoUrl)) list.push({ url: s.photoUrl!, folder: "People", tags: ["speaker", ...(s.event?.slug ? [s.event.slug] : [])], people: s.fullName,
    usage: { targetType: "speaker", targetId: s.id, label: `Speaker photo · ${s.fullName}` } });
  for (const e of events) if (isR2PublicUrl(e.coverImageUrl)) list.push({ url: e.coverImageUrl!, folder: "Events", tags: ["event cover", e.slug],
    usage: { targetType: "eventCover", targetId: e.id, label: `Event cover · ${e.title}`, href: `/events/${e.slug}` } });
  return list.filter((c) => !seen.has(c.url) && !linked.has(`${c.usage.targetType}:${c.usage.targetId}`));
}

export async function GET(req: NextRequest) {
  const gate = await assetActor(req, false);
  if ("error" in gate) return gate.error;
  return NextResponse.json({ remaining: (await candidates()).length });
}

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const todo = await candidates();
  let imported = 0, failed = 0;
  for (const c of todo.slice(0, BATCH)) {
    try {
      const res = await fetch(c.url, { signal: AbortSignal.timeout(15_000) });
      const type = (res.headers.get("content-type") ?? "").split(";")[0];
      if (!res.ok) throw new Error(String(res.status));
      const name = decodeURIComponent(new URL(c.url).pathname.split("/").pop() ?? "picture");
      const { asset, duplicate } = await ingestAsset({ bytes: Buffer.from(await res.arrayBuffer()), fileName: name, mimeType: type, folder: c.folder, tags: c.tags, source: c.url, actor: gate.actor });
      if (!duplicate && c.people) await prisma.asset.update({ where: { id: asset.id }, data: { people: c.people } });
      if (duplicate) await prisma.asset.updateMany({ where: { id: asset.id, source: null }, data: { source: c.url } });
      await setUsage(asset.id, c.usage);
      imported++;
    } catch {
      failed++;
      // Mark it seen so a broken link doesn't stall every later batch.
      await prisma.asset.create({ data: { key: "", fileName: c.url.slice(-120), title: "Import failed", mimeType: "", sizeBytes: 0, sha256: "", source: c.url, deletedAt: new Date(), folder: c.folder } }).catch(() => {});
    }
  }
  return NextResponse.json({ imported, failed, remaining: Math.max(0, todo.length - BATCH) });
}
