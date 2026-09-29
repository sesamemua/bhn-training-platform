import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import sharp from "sharp";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";
import { CRS_EVENT_POST } from "../../src/lib/social/events";

test("Events shows the editable sponsor post and its uploaded graphic without speaker posts", () => {
  const event: QueuePost = {
    ...CRS_EVENT_POST, id: "event-1", status: "draft", cycleLabel: CRS_EVENT_POST.assetSpec.title,
    daysBefore: 0, editVersion: 0, trackChanges: true, organization: null, companyLogoUrl: null,
    assetUrl: "https://images.example/event.png", scheduledFor: CRS_EVENT_POST.scheduledFor.toISOString(),
    overdue: false, stale: false,
  };
  const html = renderToStaticMarkup(createElement(SocialQueue, {
    initial: [event, { ...event, id: "speaker-1", stream: "symposium_2026", body: "Speaker-only text" }],
    initialGroup: "events",
  }));
  assert.match(html, /aria-selected="true"[^>]*>Events/);
  assert.match(html, /<textarea[^>]*aria-label="Post text for CRS Women’s Health Symposium 2026"/);
  assert.match(html, /pleased to support/);
  assert.match(html, /Replace graphic/);
  assert.match(html, /src="https:\/\/images.example\/event.png"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
  assert.doesNotMatch(html, /Speaker-only text/);
});

test("graphic upload requires admin, validates images, and preserves the current asset on conflicts", async () => {
  // Execute the real route with only authentication, DB and storage replaced; no live writes.
  const source = readFileSync("src/app/api/admin/social/posts/[id]/graphic/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const require = createRequire(import.meta.url);
  let authorized = true;
  let post = { id: "event-1", stream: "events", status: "approved", assetUrl: "https://images.example/original.png" };
  let raced = false;
  const writes: unknown[] = [];
  const uploads: string[] = [];
  const removed: string[] = [];
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => authorized ? { user: { id: "admin" } } : null },
    "@/lib/prisma": { prisma: { socialPost: {
      findUnique: async () => post,
      updateMany: async ({ where, data }: { where: typeof post; data: unknown }) => {
        assert.equal(where.status, post.status);
        assert.equal(where.assetUrl, post.assetUrl);
        if (raced) return { count: 0 };
        writes.push(data); return { count: 1 };
      },
    } } },
    "@/lib/r2": {
      R2_PUBLIC_URL: "https://images.example",
      putR2Object: async (key: string) => { uploads.push(key); },
      r2PublicUrl: (key: string) => `https://images.example/${key}`,
      deleteR2ObjectByUrl: async (url: string) => { removed.push(url); },
    },
  };
  const exports: { POST?: (request: Request, context: unknown) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const send = (bytes: Uint8Array, type = "image/png") => {
    const form = new FormData();
    form.set("graphic", new File([new Uint8Array(bytes)], "graphic.png", { type }));
    return exports.POST!(new Request("https://example.test/upload", { method: "POST", body: form }), { params: Promise.resolve({ id: post.id }) });
  };
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  authorized = false;
  assert.equal((await send(png)).status, 403);
  authorized = true;
  for (const status of ["published", "skipped"]) {
    post = { ...post, status };
    assert.equal((await send(png)).status, 409);
  }
  post = { ...post, status: "approved", stream: "symposium_2026" };
  assert.equal((await send(png)).status, 404);
  post.stream = "events";
  assert.equal((await send(new Uint8Array())).status, 400);
  assert.equal((await send(new Uint8Array(3_000_001))).status, 400);
  assert.equal((await send(Buffer.from("<html>not an image</html>"))).status, 400);
  assert.equal((await send(png, "image/jpeg")).status, 400);
  assert.equal(uploads.length, 0);
  const response = await send(png);
  assert.equal(response.status, 200);
  const { url } = await response.json();
  assert.deepEqual(writes, [{ assetUrl: url, status: "draft", approvedAt: null, approvedById: null }]);
  raced = true;
  assert.equal((await send(png)).status, 409);
  assert.equal(writes.length, 1);
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0], post.assetUrl);
});
