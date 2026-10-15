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
import { imageSize } from "../../src/lib/images/size";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

test("every available graphic has its own download and each group has one bulk download", () => {
  const post: QueuePost = {
    id: "event", stream: "events", kind: "event", status: "draft", campaign: true,
    cycleLabel: "Panel 1", daysBefore: 0, body: "Caption", editVersion: 0, trackChanges: true,
    assetUrl: "https://images.example/panel.png", organization: null, companyLogoUrl: null,
    assetSpec: {}, scheduledFor: "2026-10-15T13:00:00Z", overdue: false, stale: false,
  };
  for (const [group, stream, campaign] of [["symposium_2026", "events", true], ["events", "events", false], ["venture_connect", "venture_connect", false]] as const) {
    const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [{ ...post, stream, campaign }, { ...post, id: "missing", stream, campaign, cycleLabel: "No graphic", assetUrl: null }], initialGroup: group }));
    assert.match(html, /Download all graphics \(1\)/);
    assert.match(html, /aria-label="Download graphic for Panel 1"/);
    assert.doesNotMatch(html, /Download graphic for No graphic/);
  }
  const empty = renderToStaticMarkup(createElement(SocialQueue, { initial: [{ ...post, assetUrl: null }] }));
  assert.match(empty, /disabled=""[^>]*>[^]*?Download all graphics \(0\)/);
  const review = renderToStaticMarkup(createElement(SocialQueue, { initial: [post], reviewMode: true }));
  assert.match(review, /Download graphic for Panel 1/);
  assert.doesNotMatch(review, /Download all graphics/);
});

test("download route authorizes, preserves original bytes, packages in display order and rejects unsafe sources", async (t) => {
  const require = createRequire(import.meta.url);
  const source = readFileSync("src/app/api/admin/social/graphics/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: "#123456" } }).png().toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  let authorized = true;
  let lookups = 0;
  let fetches = 0;
  let badResponse = false;
  let oversize = false;
  let postUrl = "https://images.example/social/a.png";
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => authorized ? { user: { id: "admin" } } : null },
    "@/lib/prisma": { prisma: { socialPost: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      lookups++;
      return where.id.in.filter(id => id !== "missing").reverse().map(id => ({ id, stream: id === "speaker" ? "symposium_2026" : "events", kind: id === "speaker" ? "speaker" : "event", assetUrl: postUrl, assetSpec: { title: id === "second" ? "Same / Title" : "Same: Title" } }));
    } } } },
    "@/lib/r2": { R2_PUBLIC_URL_PREFIXES: ["https://images.example"] },
    "@/lib/images/size": { imageSize },
    "../posts/[id]/image/route": { GET: async () => new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } }) },
  };
  const exports: { GET?: (req: NextRequest) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  t.mock.method(globalThis, "fetch", async (_url: URL, options: RequestInit) => {
    fetches++;
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined, "never forward admin cookies to image storage");
    if (oversize) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(15 * 1024 * 1024 + 1)); controller.close(); } }));
    return new Response(badResponse ? "not an image" : new Uint8Array(png), { status: badResponse ? 503 : 200 });
  });
  const send = (query: string) => exports.GET!(new NextRequest(`https://platform.example/api/admin/social/graphics?${query}`));
  authorized = false;
  assert.equal((await send("ids=first")).status, 403);
  assert.equal(lookups, 0);
  authorized = true;
  for (const query of ["", "ids=..%2Fsecret", "ids=first,second", `ids=${Array.from({ length: 201 }, (_, i) => `p${i}`).join(",")}&zip=1`]) assert.equal((await send(query)).status, 400);
  assert.equal((await send("ids=missing")).status, 404);
  assert.equal(fetches, 0);
  const single = await send("ids=first");
  assert.equal(single.status, 200);
  assert.equal(single.headers.get("Content-Type"), "image/png");
  assert.match(single.headers.get("Content-Disposition")!, /attachment; filename="Same-Title.png"/);
  assert.equal(single.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(Buffer.from(await single.arrayBuffer()), png);
  const zip = await send("ids=second,first,speaker&zip=1");
  assert.equal(zip.headers.get("Content-Type"), "application/zip");
  const archive = await unzipper.Open.buffer(Buffer.from(await zip.arrayBuffer()));
  assert.deepEqual(archive.files.map(file => file.path), ["01-Same-Title.png", "02-Same-Title.png", "03-Same-Title.jpeg"]);
  assert.deepEqual(await archive.files[0].buffer(), png);
  assert.deepEqual(await archive.files[2].buffer(), jpeg);
  for (const url of ["http://127.0.0.1/secret", "https://images.example.evil.test/a.png", "https://images.example@evil.test/a.png", "https://evil.test/a.png"]) {
    postUrl = url;
    const count = fetches;
    assert.equal((await send("ids=first")).status, 502);
    assert.equal(fetches, count);
  }
  postUrl = "https://images.example/a.png";
  badResponse = true;
  assert.equal((await send("ids=first,second&zip=1")).status, 502);
  badResponse = false;
  oversize = true;
  assert.equal((await send("ids=first")).status, 502);
});
