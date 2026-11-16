import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => id in mocks ? mocks[id] : require(id), exports);
  return exports;
}
const isSection = (value: string) => ["top", "engage", "experience", "equip", "event"].includes(value);

function mediaHarness(assetOrigin = "https://images.example") {
  const rows = new Map<string, string>();
  const usages = new Map<string, Record<string, any>>();
  const assets = Array.from({ length: 22 }, (_, n) => ({ id: `asset-${n}`, kind: "image", key: `images/${n}.png`,
    title: `Graphic ${n}`, fileName: `${n}.png`, altText: null, consent: "unknown", people: null, expiresAt: null, deletedAt: null }));
  let status = "draft", invalidPiece = false, conflicts = 0, transactions = 0, staleWrites = 0;
  const db: any = {
    newsletterIssue: {
      findUnique: async () => ({ title: "November newsletter", status }),
      update: async ({ data }: any) => { assert.deepEqual(data, { renderedAt: null }); staleWrites++; },
    },
    newsletterPiece: { findFirst: async ({ where }: any) => !invalidPiece && where.issueId === "issue-1" ? { id: where.id } : null },
    platformSetting: {
      findMany: async ({ where }: any) => [...rows].filter(([key]) => key.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value })),
      findUnique: async ({ where }: any) => rows.has(where.key) ? { value: rows.get(where.key) } : null,
      upsert: async ({ where, create, update }: any) => { rows.set(where.key, rows.has(where.key) ? update.value : create.value); },
      deleteMany: async ({ where }: any) => { rows.delete(where.key); },
    },
    asset: { findMany: async ({ where }: any) => assets.filter((asset) => where.id.in.includes(asset.id) && !asset.deletedAt && asset.kind === "image") },
    assetUsage: {
      deleteMany: async ({ where }: any) => { for (const [id, usage] of usages) if (usage.targetType === where.targetType && (where.targetId.in?.includes(id) || (where.targetId.startsWith && id.startsWith(where.targetId.startsWith)))) usages.delete(id); },
      upsert: async ({ create }: any) => { usages.set(create.targetId, create); },
    },
    $transaction: async (operation: any, options: any) => {
      transactions++; assert.equal(options.isolationLevel, "Serializable");
      if (conflicts-- > 0) throw { code: "P2034" };
      const oldRows = new Map(rows), oldUsages = new Map(usages), oldStale = staleWrites;
      try { return await operation(db); }
      catch (error) { rows.clear(); oldRows.forEach((v, k) => rows.set(k, v)); usages.clear(); oldUsages.forEach((v, k) => usages.set(k, v)); staleWrites = oldStale; throw error; }
    },
  };
  const media = load("src/lib/newsletter/media.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/assets/usage": { assetUrl: (key: string) => `${assetOrigin}/${key}` },
    "@/lib/assets/core": { publishBlock: (asset: any) => asset.consent === "refused" ? "Consent refused." : null },
    "./types": { isSection },
  });
  return { media, rows, usages, assets, db, setStatus: (value: string) => { status = value; },
    badPiece: () => { invalidPiece = true; }, conflict: (n: number) => { conflicts = n; }, stats: () => ({ transactions, staleWrites }) };
}

test("newsletter media keeps multiple ordered section and piece pictures outside AI layout", async () => {
  const h = mediaHarness();
  const section = { targetType: "section", targetId: "event" };
  const piece = { targetType: "piece", targetId: "piece-1" };
  const pictures = await h.media.mutateNewsletterImages("issue-1", section, { action: "attach", assetIds: ["asset-0", "asset-1"] });
  assert.equal(pictures.length, 2); assert.equal(h.usages.size, 2);
  const again = await h.media.mutateNewsletterImages("issue-1", section, { action: "attach", assetIds: ["asset-0"] });
  assert.deepEqual(again, pictures); assert.equal(h.stats().staleWrites, 1, "duplicates do not stale unchanged HTML");
  await h.media.mutateNewsletterImages("issue-1", piece, { action: "attach", assetIds: ["asset-0", "asset-2"] });
  assert.equal(h.usages.size, 4, "same asset can be safely attached in two different slots");
  const reordered = await h.media.mutateNewsletterImages("issue-1", section, { action: "reorder", imageIds: pictures.map((p: any) => p.id).reverse() });
  assert.equal(reordered[0].assetId, "asset-1");
  const updated = await h.media.mutateNewsletterImages("issue-1", section, { action: "updateAlt", imageId: reordered[0].id, alt: "  Conference invitation  " });
  assert.equal(updated[0].alt, "Conference invitation");
  const all = await h.media.getNewsletterMedia("issue-1");
  assert.deepEqual(all.sectionImages.event, updated); assert.equal(all.imagesByPieceId["piece-1"].length, 2);
  await h.media.mutateNewsletterImages("issue-1", section, { action: "remove", imageId: updated[0].id });
  assert.equal(h.usages.size, 3, "remove only releases this image's usage, not another slot");
  assert.equal(h.assets.length, 22, "removing attachments never deletes shared assets");
  await h.media.removeNewsletterPieceImages(h.db, "issue-1", "piece-1");
  assert.equal(h.usages.size, 1, "piece deletion releases only that piece's usage slots");
  const afterDelete = await h.media.getNewsletterMedia("issue-1");
  assert.equal(afterDelete.imagesByPieceId["piece-1"], undefined);
  assert.equal(afterDelete.sectionImages.event.length, 1, "section attachment survives deleting a contribution");
});

test("newsletter media retries conflicts, preserves existing images, rejects stale reorder", async () => {
  const h = mediaHarness(), target = { targetType: "section", targetId: "top" };
  const first = await h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: ["asset-0"] });
  h.conflict(2);
  const next = await h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: ["asset-1"] });
  assert.equal(next.length, 2); assert.equal(next[0].id, first[0].id); assert.equal(h.stats().transactions, 4);
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", target, { action: "reorder", imageIds: [first[0].id] }), /pictures changed/);
  assert.equal((await h.media.getNewsletterMedia("issue-1")).sectionImages.top.length, 2);
  h.conflict(4);
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: ["asset-2"] }), /Another editor/);
});

test("newsletter media enforces target, sent issue, count, and asset rights", async () => {
  const h = mediaHarness(), target = { targetType: "section", targetId: "event" };
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", { ...target, targetId: "wrong" }, { action: "attach", assetIds: [] }), /valid newsletter section/);
  h.badPiece();
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", { targetType: "piece", targetId: "elsewhere" }, { action: "attach", assetIds: [] }), /Contribution not found/);
  h.setStatus("sent");
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: [] }), /already been sent/);
  h.setStatus("draft"); h.assets[1].consent = "refused";
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: ["asset-1"] }), /Consent refused/);
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: ["missing"] }), /unavailable/);
  assert.equal(h.rows.size, 0); assert.equal(h.usages.size, 0);
  await assert.rejects(h.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: h.assets.map((a) => a.id) }), /up to 20 pictures/);
  const insecure = mediaHarness("http://images.example");
  await assert.rejects(insecure.media.mutateNewsletterImages("issue-1", target, { action: "attach", assetIds: ["asset-0"] }), /Secure image storage/);
  assert.equal(insecure.rows.size, 0, "misconfigured storage never saves a silently unrenderable image");
});

test("newsletter picture route permits contributors, rejects foreign origins, and saves partial batches", async () => {
  let authorized = true, sent = false, wrongPiece = false, ingested = 0;
  const mutations: any[] = [];
  const images: any[] = [];
  class MediaError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const route = load("src/app/api/workspace/newsletter/[id]/images/route.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "instructor"); return authorized ? { user: { id: "contributor", name: "Colleague" } } : null; } },
    "@/lib/prisma": { prisma: {
      newsletterIssue: { findUnique: async () => ({ status: sent ? "sent" : "draft" }) },
      newsletterPiece: { findFirst: async () => wrongPiece ? null : { id: "piece-1" } },
    } },
    "@/lib/assets/core": { IMAGE_TYPES: ["image/png", "image/jpeg", "image/webp", "image/gif"], MAX_ASSET_BYTES: 4_300_000 },
    "@/lib/assets/store": { ingestAsset: async ({ fileName }: any) => { ingested++; if (fileName === "broken.png") throw new Error("Bad image"); return { asset: { id: fileName } }; } },
    "@/lib/newsletter/types": { isSection },
    "@/lib/newsletter/media": {
      MAX_NEWSLETTER_IMAGES: 20, NewsletterMediaError: MediaError,
      getNewsletterMedia: async () => ({ sectionImages: { event: [...images] }, imagesByPieceId: {} }),
      mutateNewsletterImages: async (_id: string, target: unknown, mutation: any) => { mutations.push({ target, mutation }); if (mutation.assetIds) for (const id of mutation.assetIds) images.push({ id, assetId: id, url: "https://images.example/a.png", alt: id }); return [...images]; },
    },
  });
  const send = (names: string[], extra: Record<string, string> = {}, targetType = "section", targetId = "event") => {
    const form = new FormData(); form.set("targetType", targetType); form.set("targetId", targetId);
    for (const name of names) form.append("files", new File([name === "disguised.png" ? "<svg></svg>" : new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], name, { type: name.endsWith(".svg") ? "image/svg+xml" : "image/png" }));
    return route.POST(new Request("https://newsletter.example/upload", { method: "POST", headers: extra, body: form }), { params: Promise.resolve({ id: "issue-1" }) });
  };
  authorized = false; assert.equal((await send(["a.png"])).status, 403); authorized = true;
  assert.equal((await send(["a.png"], { origin: "https://evil.example" })).status, 403);
  assert.equal((await send(["a.png"], { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await send(Array.from({ length: 21 }, (_, n) => `${n}.png`))).status, 400);
  sent = true; assert.equal((await send(["a.png"])).status, 409); sent = false;
  wrongPiece = true; assert.equal((await send(["a.png"], {}, "piece", "other-piece")).status, 404); wrongPiece = false;
  assert.equal(ingested, 0, "authorization and target validation precede uploading");
  const disguised = await (await send(["disguised.png"])).json();
  assert.equal(disguised.errors.length, 1); assert.equal(ingested, 0, "disguised SVG never reaches the image decoder");
  const response = await send(["first.png", "bad.svg", "broken.png", "second.png"], { origin: "https://newsletter.example" });
  assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.ok, true); assert.equal(result.images.length, 2); assert.equal(result.errors.length, 2);
  assert.deepEqual(mutations.map((m) => m.mutation.assetIds), [["first.png"], ["second.png"]]);
  const json = (body: unknown) => route.POST(new Request("https://newsletter.example/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "issue-1" }) });
  assert.equal((await json({ action: "updateAlt", targetType: "section", targetId: "event", imageId: "image-1", alt: "x".repeat(401) })).status, 400);
  assert.equal((await json({ action: "attach", targetType: "section", targetId: "event", assetIds: Array(2000).fill("asset-0") })).status, 413);
  assert.equal((await json({ action: "remove", targetType: "section", targetId: "event", imageId: "image-1" })).status, 200);
});
