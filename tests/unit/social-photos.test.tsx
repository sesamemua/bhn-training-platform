import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import ts from "typescript";
import sharp from "sharp";
import unzipper from "unzipper";
import { socialPhotos } from "../../src/lib/social/photos";
import { imageSize } from "../../src/lib/images/size";
import { SocialPostPhotos } from "../../src/components/workspace/SocialPostPhotos";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

const photos = ["DSC00613.JPG", "DSC00643.JPG", "DSC00646.JPG", "DSC00677.JPG"].map(name => ({ name, url: `https://images.example/social/ccrm/${name}` }));

test("the post and review gallery show all originals without cropping, with individual and ZIP downloads", () => {
  assert.deepEqual(socialPhotos({ photos }), photos);
  for (const spec of [null, {}, { photos: "wrong" }, { photos: [{ url: "javascript:alert(1)", name: "bad" }] }, { photos: Array(21).fill(photos[0]) }]) assert.deepEqual(socialPhotos(spec), []);
  assert.equal(renderToStaticMarkup(createElement(SocialPostPhotos, { postId: "empty", assetSpec: {} })), "");
  const html = renderToStaticMarkup(createElement(SocialPostPhotos, { postId: "ccrm", assetSpec: { photos } }));
  assert.match(html, /Photos \(4\)/);
  assert.match(html, /Download all photos/);
  assert.match(html, /ids=ccrm&amp;zip=1/);
  assert.equal((html.match(/alt="Post photo/g) ?? []).length, 4);
  assert.equal((html.match(/object-contain/g) ?? []).length, 4);
  for (const [index, photo] of photos.entries()) {
    assert.match(html, new RegExp(`aria-label="Download ${photo.name}"`));
    assert.ok(html.includes(`photo=${index}`));
  }
  const post: QueuePost = { id: "ccrm", stream: "linkedin", kind: "post", status: "draft", cycleLabel: "CCRM", daysBefore: 0,
    body: "Approved copy", editVersion: 0, trackChanges: true, assetUrl: null, organization: null, companyLogoUrl: null,
    assetSpec: { photos }, scheduledFor: "2026-11-18T20:00:00Z", overdue: false, stale: false };
  const queue = renderToStaticMarkup(createElement(SocialQueue, { initial: [post], initialGroup: "linkedin", reviewMode: true }));
  assert.match(queue, /Photos \(4\)/);
  assert.doesNotMatch(queue, /Graphic needed/);
  assert.match(queue, /disabled=""[^>]*aria-label="Schedule CCRM"/);
});

test("photo downloads require admin, preserve all four byte-for-byte and reject invalid indices and untrusted URLs", async (t) => {
  const require = createRequire(import.meta.url);
  const source = readFileSync("src/app/api/admin/social/graphics/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const original = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#527966" } }).jpeg().toBuffer();
  let authorized = true, fetches = 0;
  let spec: unknown = { photos };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => authorized ? { user: { id: "admin" } } : null },
    "@/lib/prisma": { prisma: { socialPost: { findMany: async () => [{ id: "ccrm", stream: "linkedin", kind: "post", assetUrl: null, assetSpec: spec }] } } },
    "@/lib/r2": { R2_PUBLIC_URL_PREFIXES: ["https://images.example"] },
    "@/lib/images/size": { imageSize },
    "@/lib/social/photos": { socialPhotos },
    "../posts/[id]/image/route": { GET: async () => { throw new Error("Not a speaker graphic"); } },
  };
  const exports: { GET?: (req: NextRequest) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  t.mock.method(globalThis, "fetch", async (_url: URL, options: RequestInit) => {
    fetches++;
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    return new Response(new Uint8Array(original));
  });
  const send = (query: string) => exports.GET!(new NextRequest(`https://platform.example/api/admin/social/graphics?ids=ccrm&${query}`));
  authorized = false;
  assert.equal((await send("zip=1")).status, 403);
  assert.equal(fetches, 0);
  authorized = true;
  for (const query of ["photo=-1", "photo=1.5", "photo=x", "photo=0&zip=1"]) assert.equal((await send(query)).status, 400);
  assert.equal((await send("photo=4")).status, 404);
  assert.equal(fetches, 0);
  const single = await send("photo=2");
  assert.equal(single.status, 200);
  assert.match(single.headers.get("Content-Disposition")!, /DSC00646.JPG/);
  assert.deepEqual(Buffer.from(await single.arrayBuffer()), original);
  const zip = await send("zip=1");
  assert.equal(zip.status, 200);
  const archive = await unzipper.Open.buffer(Buffer.from(await zip.arrayBuffer()));
  assert.deepEqual(archive.files.map(file => file.path), photos.map((photo, index) => `01-0${index + 1}-${photo.name}`));
  for (const file of archive.files) assert.deepEqual(await file.buffer(), original);
  for (const url of ["https://evil.test/private.jpg", "https://images.example.evil.test/x.jpg", "https://user:password@images.example/x.jpg"]) {
    spec = { photos: [{ ...photos[0], url }] };
    const before = fetches;
    assert.equal((await send("photo=0")).status, 502);
    assert.equal(fetches, before);
  }
});

test("photo upload retains original bytes, resets approval and does not overwrite concurrent edits or published posts", async () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync("src/app/api/admin/social/posts/[id]/photos/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#527966" } }).jpeg().toBuffer();
  let authorized = true, conflict = false, uploads = 0, cleanups = 0, audits = 0;
  let post = { id: "ccrm", status: "approved", editVersion: 0, assetUrl: null as string | null, bufferPostId: null as string | null, assetSpec: { title: "Approved CCRM copy", photos: [] as typeof photos } };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => authorized ? { user: { id: "admin" } } : null },
    "@/lib/prisma": { prisma: {
      socialPost: { findUnique: async () => post },
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
        socialPost: { updateMany: async ({ where, data }: { where: { editVersion: number }; data: { assetSpec: typeof post.assetSpec; editVersion: { increment: number }; status: string; approvedAt: null; approvedById: null } }) => {
          assert.equal(where.editVersion, post.editVersion);
          if (conflict) return { count: 0 };
          assert.equal(data.approvedAt, null);
          assert.equal(data.approvedById, null);
          post = { ...post, assetSpec: data.assetSpec, status: data.status, editVersion: post.editVersion + data.editVersion.increment };
          return { count: 1 };
        } },
        auditLog: { create: async () => { audits++; } },
      }),
    } },
    "@/lib/images/size": { imageSize },
    "@/lib/social/photos": { socialPhotos },
    "@/lib/r2": {
      putR2Object: async (_key: string, stored: Buffer) => { assert.deepEqual(stored, bytes); uploads++; },
      r2PublicUrl: (key: string) => `https://images.example/${key}`,
      deleteR2ObjectByUrl: async () => { cleanups++; },
    },
  };
  const exports: { POST?: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const send = (version = post.editVersion, origin = "https://platform.example", content: Uint8Array = bytes) => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(content)], "DSC00613.JPG", { type: "image/jpeg" }));
    form.set("expectedVersion", String(version));
    return exports.POST!(new NextRequest("https://platform.example/api/admin/social/posts/ccrm/photos", { method: "POST", headers: { origin }, body: form }), { params: Promise.resolve({ id: "ccrm" }) });
  };
  authorized = false;
  assert.equal((await send()).status, 403);
  authorized = true;
  assert.equal((await send(0, "https://evil.example")).status, 403);
  assert.equal((await send(0, undefined, new Uint8Array([1, 2, 3]))).status, 400);
  assert.equal((await send(0, undefined, new Uint8Array(4 * 1024 * 1024 + 1))).status, 400);
  assert.equal(uploads, 0);
  assert.equal((await send()).status, 200);
  assert.equal(post.status, "draft");
  assert.equal(post.assetSpec.title, "Approved CCRM copy");
  assert.equal(post.assetSpec.photos.length, 1);
  assert.equal(post.editVersion, 1);
  assert.equal(audits, 1);
  assert.equal((await send(0)).status, 409);
  conflict = true;
  assert.equal((await send()).status, 409);
  assert.equal(cleanups, 1);
  assert.equal(post.assetSpec.photos.length, 1);
  conflict = false;
  post.status = "published";
  assert.equal((await send()).status, 409);
  post.status = "draft";
  post.bufferPostId = "buffer-post";
  assert.equal((await send()).status, 409);
  post.bufferPostId = null;
  post.assetUrl = "https://images.example/graphic.png";
  assert.equal((await send()).status, 409);
});
