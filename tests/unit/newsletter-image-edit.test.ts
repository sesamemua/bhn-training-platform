/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated storage and route fixtures. */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import { editReviewImages, imageEditSchema, reviewImages } from "../../src/lib/page-review/edit-images";
import { editReviewHtml, htmlRevision } from "../../src/lib/page-review/edit-html";

const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: any = {};
  new Function("require", "exports", code)((id: string) => id in mocks ? mocks[id] : require(id), exports);
  return exports;
}
const source = '<h2>Event</h2><p data-nl-image="slot-1"><a href="https://event.test"><picture><source srcset="old-2x.png"><img src="https://images.test/old.png" alt="Original" width="512" height="300" srcset="old-2x.png"></picture></a></p><img src="https://images.test/second.png" alt="Second"><div data-bhn-review-ui><img src="tool.png"></div>';
const before = { src: "https://images.test/old.png", alt: "Original" };

test("image changes preserve links, reject stale targets and cannot inject markup or unsafe URLs", () => {
  assert.equal(reviewImages(source).length, 2);
  const edited = editReviewImages(source, [{ index: 0, before, assetId: "new", url: "https://images.test/new.png", alt: '<img onerror="bad()">', width: 50, align: "right" }]);
  const doc = new JSDOM(edited.html).window.document, image = doc.querySelector("img")!;
  assert.equal(doc.querySelector("a")?.href, "https://event.test/");
  assert.equal(image.getAttribute("src"), "https://images.test/new.png");
  assert.equal(image.getAttribute("alt"), '<img onerror="bad()">');
  assert.equal(image.getAttribute("width"), "50%");
  assert.equal(image.style.height, "auto");
  assert.equal(image.style.marginLeft, "auto");
  assert.equal(image.style.marginRight, "0px");
  assert.equal(image.hasAttribute("height"), false);
  assert.equal(image.hasAttribute("srcset"), false);
  assert.equal(doc.querySelector("source"), null);
  assert.equal(edited.changes[0].imageId, "slot-1");
  assert.throws(() => editReviewImages(source, [{ index: 0, before: { ...before, alt: "Wrong" }, remove: true }]), /selected image changed/);
  assert.throws(() => editReviewImages(source, [{ index: 0, before, remove: true }, { index: 0, before, alt: "Again" }]), /selected image changed/);
  assert.throws(() => editReviewImages(source, [{ index: 0, before, assetId: "bad", url: "javascript:alert(1)" }]), /secure public URL/);
  assert.equal(imageEditSchema.safeParse({ index: 0, before, width: 200 }).success, false);
  assert.equal(imageEditSchema.safeParse({ index: 0, before, src: "https://evil.test/a.png" }).success, false);
  assert.equal(editReviewImages(source, [{ index: 0, before, alt: "Original" }]).html, source);
  const removed = editReviewImages(source, [{ index: 0, before, remove: true }]).html;
  assert.equal(reviewImages(removed).length, 1);
  assert.equal(new JSDOM(removed).window.document.querySelector("a"), null, "remove does not leave an empty focusable image link");
  const textLink = '<a href="https://event.test"><img src="https://images.test/old.png" alt="Original">Register</a>';
  assert.equal(new JSDOM(editReviewImages(textLink, [{ index: 0, before, remove: true }]).html).window.document.querySelector("a")?.textContent, "Register");
});

function mediaFixture() {
  const assets = [{ id: "old", key: "old.png", kind: "image", mimeType: "image/png", sizeBytes: 100, width: 4, height: 2, title: "Old", altText: "Original", deletedAt: null, consent: "given", people: null, expiresAt: null },
    { id: "new", key: "new.png", kind: "image", mimeType: "image/png", sizeBytes: 100, width: 2, height: 2, title: "New", altText: "New", deletedAt: null, consent: "given", people: null, expiresAt: null }];
  const key = "newsletter.media.issue.piece.first";
  const rows = new Map([[key, JSON.stringify({ version: 1, images: [{ id: "slot-1", assetId: "old", url: before.src, alt: before.alt }] })]]);
  const usages: any[] = [];
  const db: any = {
    asset: { findUnique: async ({ where }: any) => assets.find(asset => asset.id === where.id), findMany: async ({ where }: any) => assets.filter(asset => where.key.in.includes(asset.key)) },
    platformSetting: { findMany: async () => [...rows].map(([key, value]) => ({ key, value })), update: async ({ where, data }: any) => rows.set(where.key, data.value) },
    assetUsage: { upsert: async ({ create }: any) => usages.push(create), deleteMany: async () => {} },
  };
  const media = load("src/lib/newsletter/review-images.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: db }, "@/lib/assets/store": { ingestAsset: async () => { throw new Error("no upload expected"); } },
    "@/lib/assets/usage": { assetUrl: (key: string) => `https://images.test/${key}` },
    "@/lib/r2": { r2: null, R2_BUCKET: "images", r2KeyFromPublicUrl: (url: string) => url.startsWith("https://images.test/") ? url.slice(20) : null },
  });
  return { media, db, assets, rows, usages, key };
}

test("image replacement syncs Compose references and retains originals for earlier rounds", async () => {
  const h = mediaFixture();
  const resolved = await h.media.resolveReviewImageEdits(h.db, [{ index: 0, before, assetId: "new", alt: "New description" }]);
  assert.equal(resolved[0].url, "https://images.test/new.png");
  const edited = editReviewImages(source, resolved);
  await h.media.saveReviewImageReferences(h.db, "issue", edited.changes);
  const stored = JSON.parse(h.rows.get(h.key)!);
  assert.deepEqual(stored.images, [{ id: "slot-1", assetId: "new", url: "https://images.test/new.png", alt: "New description" }]);
  assert.deepEqual([...new Set(h.usages.filter(u => u.targetType === "newsletterReviewImage").map(u => u.assetId))].sort(), ["new", "old"]);
  h.assets[1].consent = "refused";
  await assert.rejects(h.media.resolveReviewImageEdits(h.db, [{ index: 0, before, assetId: "new" }]), /refused consent/);
  await assert.rejects(h.media.resolveReviewImageEdits(h.db, [{ index: 0, before, assetId: "missing" }]), /no longer available/);
});

test("crop and quarter-turn are baked into image pixels without changing the source", async () => {
  const h = mediaFixture();
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 4, background: "red" } }).png().toBuffer();
  const transform = h.media.imageTransformSchema.parse({ crop: { left: 0, top: 0, width: .5, height: .5 }, rotate: 90, flipX: true });
  const result = await h.media.transformReviewPicture(bytes, transform);
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 4); assert.equal(meta.height, 6);
  assert.equal((await sharp(bytes).metadata()).width, 12);
  assert.equal(h.media.imageTransformSchema.safeParse({ crop: { left: .8, top: 0, width: .5, height: 1 }, rotate: 0 }).success, false);
  await assert.rejects(h.media.transformReviewPicture(Buffer.from('<svg width="10" height="10"></svg>'), { rotate: 0 }), /Choose a PNG/);
});

test("transformed stored assets preserve rights, reject blocked sources and never fetch a client URL", async () => {
  const bytes = await sharp({ create: { width: 4, height: 2, channels: 4, background: "blue" } }).png().toBuffer();
  let consent = "given", duplicate = false, revokeWhileProcessing = false, reads = 0, uploads = 0;
  const original = { id: "original", key: "assets/original.png", kind: "image", mimeType: "image/png", sizeBytes: bytes.length, width: 4, height: 2, title: "Original", fileName: "original.png", altText: "Source alt", origin: "camera", consent, people: "Speaker", credit: "Photographer", license: "Newsletter only", expiresAt: new Date("2099-01-01"), deletedAt: null };
  let derived: any = { ...original, id: "derived", key: "assets/derived.png", width: 2, height: 4, consent: "unknown", people: null, credit: null, license: null, expiresAt: null, altText: null };
  const media = load("src/lib/newsletter/review-images.ts", {
    "server-only": {},
    "@/lib/prisma": { prisma: { asset: {
      findUnique: async ({ where }: any) => where.id === "original" ? { ...original, consent } : derived,
      update: async ({ data }: any) => { derived = { ...derived, ...data }; },
    } } },
    "@/lib/assets/usage": { assetUrl: (key: string) => `https://images.test/${key}` },
    "@/lib/r2": { R2_BUCKET: "bucket", r2KeyFromPublicUrl: () => null, r2: { send: async ({ input }: any) => {
      reads++; assert.equal(input.Bucket, "bucket"); assert.equal(input.Key, original.key);
      return { ContentLength: bytes.length, Body: { transformToByteArray: async () => bytes } };
    } } },
    "@/lib/assets/store": { ingestAsset: async ({ mimeType, origin }: any) => {
      uploads++; assert.equal(mimeType, "image/png"); assert.equal(origin, "edited");
      if (revokeWhileProcessing) consent = "refused";
      return { asset: { id: "derived", key: derived.key }, duplicate };
    } },
  });
  const request = { assetId: "original", transform: { rotate: 90 }, issueId: "issue", actorId: "staff" };
  consent = "refused"; await assert.rejects(media.uploadReviewPicture(request), /refused consent/); assert.equal(reads, 0); assert.equal(uploads, 0);
  consent = "given";
  const result = await media.uploadReviewPicture(request);
  assert.equal(result.id, "derived"); assert.equal(derived.consent, "given"); assert.equal(derived.people, "Speaker");
  assert.equal(derived.license, "Newsletter only"); assert.equal(derived.credit, "Photographer"); assert.equal(derived.expiresAt, original.expiresAt);
  revokeWhileProcessing = true;
  await assert.rejects(media.uploadReviewPicture(request), /refused consent/);
  revokeWhileProcessing = false; consent = "given"; duplicate = true; derived.license = "Different licence";
  await assert.rejects(media.uploadReviewPicture(request), /different image rights/);
});

test("image-only saves and uploads enforce permissions, current revisions and atomic history", async () => {
  let role = "instructor", sent = false, guest = false, uploadCount = 0, failReferences = false, advanceDuringUpload = false;
  let row: any = { id: "newsletter-issue", kind: "paste", status: "open", round: 4, pastedHtml: source };
  let issueHtml = source;
  const rawContribution = { rawBody: "Original contributor submission", layout: { headline: "Original layout" } };
  const snapshots: any[] = [], audit: any[] = [];
  const payload = { expectedRound: 4, revision: htmlRevision(source), issueRevision: "2026-11-26T12:00:00.000Z", images: [{ index: 0, before, assetId: "new", alt: "New alt" }] };
  const h = mediaFixture();
  const db: any = {
    user: { findUnique: async () => ({ id: "staff", role, isActive: true }) },
    pageReview: { findUnique: async () => row, updateMany: async ({ data }: any) => { row = { ...row, ...data, round: row.round + 1 }; return { count: 1 }; } },
    newsletterIssue: { findUnique: async () => ({ status: sent ? "sent" : "draft", updatedAt: new Date(payload.issueRevision) }), updateMany: async ({ data }: any) => { if (sent) return { count: 0 }; issueHtml = data.renderedHtml; return { count: 1 }; } },
    pageReviewVersion: { create: async ({ data }: any) => snapshots.push(data) }, auditLog: { create: async ({ data }: any) => audit.push(data) },
    newsletterPiece: { update: async () => { throw new Error("Original contributions must not change"); } },
  };
  const route = load("src/app/api/public/page-review/[token]/document/route.ts", {
    "@/lib/prisma": { prisma: db }, "@/lib/page-review/edit-html": { editReviewHtml, htmlRevision },
    "@/lib/page-review/viewer": { verifyPageReviewViewerToken: async () => ({ userId: "staff", kind: guest ? "anon" : "user" }) },
    "@/lib/newsletter/review-images": { ...h.media, newsletterReviewImages: async () => reviewImages(source).map(image => ({ ...image, assetId: "old" })),
      resolveReviewImageEdits: async (_db: any, edits: any[]) => h.media.resolveReviewImageEdits(h.db, edits),
      saveReviewImageReferences: async () => { if (failReferences) throw new Error("storage unavailable"); },
      uploadReviewPicture: async () => { uploadCount++; if (advanceDuringUpload) row = { ...row, round: 5 }; return { id: "new", url: "https://images.test/new.png", alt: "New", width: 2, height: 2 }; } },
    "@/lib/symposium-report/store": { reportTransaction: async (run: any) => {
      const previous = structuredClone(row), previousHtml = issueHtml;
      try { return await run(db); } catch (error) { row = previous; issueHtml = previousHtml; snapshots.length = 0; audit.length = 0; throw error; }
    } },
  });
  const call = (method: string, body: any = payload) => route[method](new Request("https://review.test/api", { method, headers: { Authorization: "Bearer staff" },
    ...(method === "GET" ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) }), { params: Promise.resolve({ token: "token" }) });
  const form = () => { const data = new FormData(); data.set("expectedRound", "4"); data.set("revision", payload.revision); data.set("issueRevision", payload.issueRevision); data.set("file", new File(["picture"], "image.png", { type: "image/png" })); return data; };
  guest = true; assert.equal((await call("POST", form())).status, 403); guest = false;
  role = "trainee"; assert.equal((await call("PATCH")).status, 403); role = "instructor";
  sent = true; assert.equal((await call("POST", form())).status, 409); assert.equal((await call("PATCH")).status, 409); sent = false;
  const stale = form(); stale.set("expectedRound", "3"); assert.equal((await call("POST", stale)).status, 409);
  assert.equal(uploadCount, 0);
  assert.equal((await call("POST", form())).status, 200);
  assert.equal(uploadCount, 1); assert.equal(issueHtml, source); assert.equal(row.round, 4); assert.equal(snapshots.length, 0);
  advanceDuringUpload = true;
  assert.equal((await call("POST", form())).status, 200, "an upload may finish after another editor saves, without mutating the document");
  assert.equal((await call("PATCH")).status, 409, "the pending replacement cannot overwrite the newer round");
  assert.equal(issueHtml, source); assert.equal(snapshots.length, 0);
  advanceDuringUpload = false; row.round = 4;
  assert.equal((await (await call("GET")).json()).images[0].assetId, "old");
  assert.equal((await call("PATCH", { ...payload, images: [{ ...payload.images[0], width: 999 }] })).status, 400);
  failReferences = true; await assert.rejects(call("PATCH"), /storage unavailable/);
  assert.equal(issueHtml, source); assert.equal(row.round, 4); failReferences = false;
  assert.equal((await call("PATCH")).status, 200);
  assert.equal(row.round, 5); assert.equal(snapshots[0].html, source);
  assert.match(issueHtml, /new.png/); assert.equal(audit[0].action, "newsletter.review.image-edit");
  assert.deepEqual(rawContribution, { rawBody: "Original contributor submission", layout: { headline: "Original layout" } });
  assert.equal((await call("PATCH")).status, 409);
});
