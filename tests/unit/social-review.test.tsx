import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

const post: QueuePost = {
  id: "review-1", stream: "events", kind: "event", status: "draft", cycleLabel: "Keynote",
  daysBefore: 0, body: "Join our symposium.", editVersion: 3, trackChanges: true,
  assetUrl: "https://images.example/keynote.png", organization: null, companyLogoUrl: null,
  assetSpec: {}, scheduledFor: "2026-10-14T13:00:00Z", overdue: false, stale: false,
};

test("individual review shows the event despite the default speaker tab, with image and Approve", () => {
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [post], reviewMode: true }));
  assert.match(html, /Join our symposium/);
  assert.match(html, /src="https:\/\/images.example\/keynote.png"/);
  assert.match(html, /> Approve<\/button>/);
  assert.match(html, /Copy review link for Keynote/);
  assert.match(html, /All social posts/);
  assert.doesNotMatch(html, /role="tablist"/);
});

test("queue links to individual reviews and approved review identifies the human", () => {
  const queue = renderToStaticMarkup(createElement(SocialQueue, { initial: [post], initialGroup: "events" }));
  assert.match(queue, /href="\/admin\/workspace\/marketing\/social\?post=review-1"/);
  const approved = renderToStaticMarkup(createElement(SocialQueue, { initial: [{ ...post, status: "approved", approvedAt: "2026-10-13T19:00:00Z", approvedByName: "Colleague" }], reviewMode: true }));
  assert.match(approved, /Approved by Colleague on/);
  assert.doesNotMatch(approved, /> Approve<\/button>/);
});

test("approval requires an identified admin and exact revision; asset replacement invalidates approval", async () => {
  const source = readFileSync("src/app/api/admin/social/posts/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const require = createRequire(import.meta.url);
  let session: { user: { id?: string; name: string } } | null = { user: { id: "reviewer", name: "Colleague" } };
  let current = { id: post.id, status: "draft", editVersion: 3 };
  const writes: Array<Record<string, unknown>> = [];
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return session; } },
    "@/lib/prisma": { prisma: { socialPost: {
      findUnique: async () => current,
      updateMany: async ({ where, data }: { where: typeof current; data: Record<string, unknown> }) => {
        if (where.editVersion !== current.editVersion || where.status !== current.status) return { count: 0 };
        writes.push(data); return { count: 1 };
      },
    } } },
    "@/lib/social/types": { TERMINAL_STATUSES: ["published", "skipped"] },
    "@/lib/social/cycles": {}, "@/lib/social/sync": {}, "@/lib/social/edit": {},
  };
  const exports: { POST?: (req: Request) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const send = (body: object) => exports.POST!(new Request("https://example.test/api/admin/social/posts", { method: "POST", body: JSON.stringify({ id: post.id, ...body }), headers: { "Content-Type": "application/json" } }));
  session = null;
  assert.equal((await send({ action: "approve", expectedVersion: 3 })).status, 403);
  session = { user: { name: "Unknown" } };
  assert.equal((await send({ action: "approve", expectedVersion: 3 })).status, 403);
  session = { user: { id: "reviewer", name: "Colleague" } };
  assert.equal((await send({ action: "approve", expectedVersion: 2 })).status, 409);
  assert.equal(writes.length, 0);
  const approved = await send({ action: "approve", expectedVersion: 3 });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).approvedByName, "Colleague");
  assert.equal(writes[0].approvedById, "reviewer");
  assert.ok(writes[0].approvedAt instanceof Date);
  assert.equal(writes[0].status, "approved");
  current = { ...current, status: "approved" };
  assert.equal((await send({ action: "setAsset", assetUrl: "https://images.example/new.png" })).status, 200);
  assert.deepEqual(writes[1], { assetUrl: "https://images.example/new.png", editVersion: { increment: 1 }, status: "draft", approvedAt: null, approvedById: null });
  for (const status of ["published", "skipped"]) {
    current = { ...current, status };
    assert.equal((await send({ action: "approve", expectedVersion: 3 })).status, 409);
    assert.equal((await send({ action: "setAsset", assetUrl: "https://images.example/new.png" })).status, 409);
  }
  assert.equal(writes.length, 2);
  current = { ...current, status: "draft" };
  assert.equal((await send({ action: "markPublished" })).status, 200);
  assert.equal(writes[2].status, "published");
  assert.ok(writes[2].publishedAt instanceof Date);
});
