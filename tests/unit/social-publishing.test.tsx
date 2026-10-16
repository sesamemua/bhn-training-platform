import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import ts from "typescript";
import { BUFFER_CHANNEL_ID, BufferRejected, connectedBufferPage, createBufferPost, readBufferPost } from "../../src/lib/social/buffer";
import { SocialPublishControls } from "../../src/components/workspace/SocialPublishControls";
import type { QueuePost } from "../../src/components/workspace/SocialQueue";
import { editSocialPost } from "../../src/lib/social/edit";

const remote = { id: "buffer-1", channelId: BUFFER_CHANNEL_ID, status: "sending", sentAt: null as string | null };
const initial = {
  id: "post-1", stream: "events", kind: "event", status: "approved", body: "Join our symposium.",
  editVersion: 3, approvedAt: new Date("2026-10-15T16:00:00Z"), approvedById: "admin",
  assetUrl: "https://images.example/social/graphic.png", assetSpec: { title: "Annual Symposium" },
  bufferPostId: null as string | null, publishError: null as string | null, deadlineId: "speaker-1",
  daysBefore: 0, scheduledFor: new Date("2026-10-15T13:00:00Z"),
};

type Handlers = { GET: () => Promise<Response>; POST: (req: NextRequest, context?: unknown) => Promise<Response> };
function load(path: string, mocks: Record<string, unknown>): Handlers {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const require = createRequire(import.meta.url);
  const exports = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  return exports as Handlers;
}

function harness() {
  const state = {
    post: { ...initial }, authorized: true, rejectClaim: false, rejectProvider: false, timeout: false,
    connected: true, creates: 0, uploads: 0, audits: 0, result: { ...remote },
    dueAt: undefined as string | undefined,
    speakerAt: new Date("2026-10-14T12:00:00Z"),
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => state.authorized ? { user: { id: "admin" } } : null },
    "@/lib/prisma": { prisma: {
      socialPost: {
        findUnique: async () => ({ ...state.post }),
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (state.rejectClaim || Object.entries(where).some(([key, value]) => state.post[key as keyof typeof state.post] !== value)) return { count: 0 };
          Object.assign(state.post, data); return { count: 1 };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state.post, data); return { ...state.post }; },
      },
      speaker: { findUnique: async () => ({ updatedAt: state.speakerAt }) },
      equipDeadline: { findUnique: async () => null },
      auditLog: { create: async () => { state.audits++; } },
    } },
    "@/lib/r2": { R2_PUBLIC_URL_PREFIXES: ["https://images.example"],
      putR2Object: async () => { state.uploads++; }, r2PublicUrl: (key: string) => `https://images.example/${key}` },
    "@/lib/social/buffer": {
      BUFFER_CHANNEL_URL: "https://publish.buffer.com/company", BufferRejected,
      connectedBufferPage: async () => { if (!state.connected) throw new Error("Reconnect BioHubNet"); },
      createBufferPost: async (text: string, image: string, alt: string, dueAt?: string) => {
        state.creates++;
        state.dueAt = dueAt;
        assert.match(text, /Join our symposium/); assert.match(text, /@BioHubNet/);
        assert.match(image, /^https:\/\/images.example\/social\//); assert.equal(alt, "Annual Symposium");
        if (state.rejectProvider) throw new BufferRejected("Post rejected");
        if (state.timeout) throw new Error("Timeout");
        return state.result;
      },
      readBufferPost: async (id: string) => { assert.equal(id, remote.id); return state.result; },
    },
    "../posts/[id]/image/route": { GET: async () => new Response(new Uint8Array([137, 80, 78, 71])) },
  };
  const route = load("src/app/api/admin/social/publish/route.ts", mocks);
  const send = (data: object = {}, origin = "https://platform.test") => route.POST(new NextRequest("https://platform.test/api/admin/social/publish", {
    method: "POST", headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify({ action: "publish", id: initial.id, expectedVersion: 3, ...data }),
  }));
  return { state, route, send, mocks };
}

test("Buffer API sends the saved text and public image only to the verified company Page", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.BUFFER_API_KEY;
  const calls: Array<{ query: string; variables: { input: Record<string, unknown> } }> = [];
  process.env.BUFFER_API_KEY = "test-only-key";
  let channel = { id: BUFFER_CHANNEL_ID, name: "BioHubNet", displayName: "BioHubNet", service: "linkedin", type: "page", isDisconnected: false, isLocked: false };
  let rejected = false;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.buffer.com");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-only-key");
    assert.equal(options?.redirect, "error");
    const body = JSON.parse(String(options?.body)); calls.push(body);
    return Response.json({ data: body.query.includes("createPost") ? { createPost: rejected ? { message: "Rejected" } : { post: remote } }
      : body.query.includes("query Status") ? { post: remote } : { channel } });
  };
  try {
    await connectedBufferPage();
    await createBufferPost("The approved words", initial.assetUrl, "The approved graphic");
    assert.deepEqual(calls[1].variables.input, { channelId: BUFFER_CHANNEL_ID, text: "The approved words", schedulingType: "automatic", mode: "shareNow", needsApproval: false, saveToDraft: false,
      assets: [{ image: { url: initial.assetUrl, metadata: { altText: "The approved graphic" } } }] });
    await readBufferPost(remote.id);
    assert.deepEqual(calls[2].variables.input, { id: remote.id });
    await createBufferPost("The approved words", initial.assetUrl, "The approved graphic", "2030-10-23T13:00:00.000Z");
    assert.equal(calls[3].variables.input.mode, "customScheduled");
    assert.equal(calls[3].variables.input.dueAt, "2030-10-23T13:00:00.000Z");
    assert.equal(calls[3].variables.input.channelId, BUFFER_CHANNEL_ID);
    for (const change of [{ type: "profile" }, { isDisconnected: true }, { isLocked: true }, { id: "personal" }, { name: "Someone else", displayName: "Someone else" }]) {
      const original = channel; channel = { ...channel, ...change };
      await assert.rejects(connectedBufferPage(), /reconnected/); channel = original;
    }
    rejected = true;
    await assert.rejects(createBufferPost("text", initial.assetUrl, "alt"), BufferRejected);
    delete process.env.BUFFER_API_KEY;
    await assert.rejects(connectedBufferPage(), /not configured/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.BUFFER_API_KEY; else process.env.BUFFER_API_KEY = oldKey;
  }
});

test("publishing requires admin, same origin, approval, exact version, connection and LinkedIn length", async () => {
  const { state, route, send } = harness();
  state.authorized = false;
  assert.equal((await route.GET()).status, 403); assert.equal((await send()).status, 403);
  state.authorized = true;
  assert.equal((await send({}, "https://attacker.test")).status, 403);
  assert.equal((await send({ expectedVersion: -1 })).status, 400);
  for (const status of ["draft", "skipped", "published", "publishing", "scheduled"]) {
    state.post.status = status; assert.equal((await send()).status, 409);
  }
  state.post.status = "approved";
  assert.equal((await send({ expectedVersion: 2 })).status, 409);
  state.post.body = "x".repeat(3000); assert.equal((await send()).status, 400); state.post.body = initial.body;
  state.post.stream = "symposium_2026"; state.post.kind = "speaker"; state.speakerAt = new Date("2026-10-16");
  assert.equal((await send()).status, 409);
  state.post.stream = "venture_connect"; state.post.kind = "reminder";
  assert.equal((await send()).status, 409);
  state.post.stream = "events"; state.post.kind = "event";
  state.connected = false;
  assert.equal((await send()).status, 503); assert.equal((await route.GET()).status, 503);
  assert.equal(state.creates, 0); assert.equal(state.post.status, "approved");
});

test("two simultaneous clicks create one post; delivery is confirmed separately, never a page view", async () => {
  const { state, route, send } = harness();
  assert.equal((await route.GET()).status, 200); assert.equal(state.creates, 0);
  const responses = await Promise.all([send(), send()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(state.creates, 1); assert.equal(state.audits, 1);
  assert.equal(state.post.status, "publishing"); assert.equal(state.post.bufferPostId, remote.id);
  assert.equal((await send()).status, 409);
  state.result = { ...remote, status: "sent", sentAt: "2026-10-15T16:30:00Z" };
  const confirmed = await send({ action: "refresh" });
  assert.equal(confirmed.status, 200); assert.equal((await confirmed.json()).post.status, "published");
  assert.equal(state.creates, 1);
});

test("scheduling requires approval and a future instant, queues once in Buffer and preserves the chosen time", async () => {
  const { state, send } = harness();
  const at = new Date(Date.now() + 86400000).toISOString();
  for (const bad of ["invalid", "2020-01-01T00:00:00.000Z", new Date(Date.now() + 1000).toISOString()]) {
    assert.equal((await send({ action: "schedule", at: bad })).status, 400);
  }
  assert.equal((await send({ action: "schedule" })).status, 400);
  state.post.status = "draft";
  assert.equal((await send({ action: "schedule", at })).status, 409);
  state.post.status = "approved";
  assert.equal(state.creates, 0);
  state.result.status = "scheduled";
  const results = await Promise.all([send({ action: "schedule", at }), send({ action: "schedule", at })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(state.creates, 1);
  assert.equal(state.dueAt, at);
  assert.equal(state.post.scheduledFor.toISOString(), at);
  assert.equal(state.post.status, "scheduled");
  assert.equal(state.post.bufferPostId, remote.id);
  assert.equal((await send({ action: "schedule", at })).status, 409);
});

test("unconfirmed scheduling stays locked while an explicit rejection restores approval", async () => {
  const at = new Date(Date.now() + 86400000).toISOString();
  const uncertain = harness(); uncertain.state.timeout = true;
  assert.equal((await uncertain.send({ action: "schedule", at })).status, 202);
  assert.equal(uncertain.state.post.status, "publishing");
  assert.equal(uncertain.state.post.scheduledFor.toISOString(), at);
  assert.equal((await uncertain.send({ action: "schedule", at })).status, 409);
  const rejected = harness(); rejected.state.rejectProvider = true;
  assert.equal((await rejected.send({ action: "schedule", at })).status, 502);
  assert.equal(rejected.state.post.status, "approved");
  assert.equal(rejected.state.post.scheduledFor.toISOString(), initial.scheduledFor.toISOString());
});

test("only Buffer-confirmed scheduled posts are labelled scheduled", async () => {
  const at = new Date(Date.now() + 86400000).toISOString();
  for (const status of ["draft", "needs_approval", "error", "sending"]) {
    const { state, send } = harness(); state.result.status = status;
    assert.equal((await send({ action: "schedule", at })).status, 200);
    assert.equal(state.post.status, "publishing");
    assert.equal(state.post.bufferPostId, remote.id);
    if (status !== "sending") assert.ok(state.post.publishError);
  }
});

test("the old date-only scheduling route cannot label a post scheduled without Buffer", async () => {
  const { state, mocks } = harness();
  const route = load("src/app/api/admin/social/posts/route.ts", { ...mocks,
    "@/lib/social/cycles": {}, "@/lib/social/sync": {}, "@/lib/social/edit": {},
  });
  const response = await route.POST(new NextRequest("https://platform.test/api/admin/social/posts", {
    method: "POST", body: JSON.stringify({ action: "schedule", id: initial.id, at: new Date(Date.now() + 86400000).toISOString() }),
  }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Buffer/);
  assert.equal(state.post.status, "approved");
  assert.equal(state.creates, 0);
});

test("invalid images and explicit provider rejections may retry; uncertain delivery must stay locked", async () => {
  for (const image of ["", "https://images.example.evil.test/a.png", "https://evil.test/a.png", "http://images.example/a.png", "https://user:pass@images.example/a.png", "/api/admin/private-image"]) {
    const { state, send } = harness(); state.post.assetUrl = image;
    assert.equal((await send()).status, 502); assert.equal(state.creates, 0); assert.equal(state.post.status, "approved");
  }
  const denied = harness(); denied.state.rejectProvider = true;
  assert.equal((await denied.send()).status, 502); assert.equal(denied.state.post.status, "approved");
  denied.state.rejectProvider = false; assert.equal((await denied.send()).status, 200);
  const uncertain = harness(); uncertain.state.timeout = true;
  assert.equal((await uncertain.send()).status, 202); assert.equal(uncertain.state.post.status, "publishing");
  assert.equal((await uncertain.send()).status, 409); assert.equal((await uncertain.send({ action: "refresh" })).status, 409);
  assert.equal(uncertain.state.creates, 1); assert.match(uncertain.state.post.publishError!, /unconfirmed/);
});

test("speaker graphics are snapshotted to public storage, never sent as authenticated image links", async () => {
  const { state, send } = harness(); state.post.stream = "symposium_2026"; state.post.kind = "speaker";
  state.post.assetUrl = "/api/admin/social/posts/post-1/image";
  assert.equal((await send()).status, 200); assert.equal(state.uploads, 1); assert.equal(state.creates, 1);
});

test("publishing locks every existing editing and manual status route, including concurrent changes", async () => {
  const { state, mocks } = harness();
  const route = load("src/app/api/admin/social/posts/route.ts", { ...mocks,
    "@/lib/social/cycles": {}, "@/lib/social/sync": {}, "@/lib/social/edit": {},
  });
  const send = (action: string) => route.POST(new NextRequest("https://platform.test/api/admin/social/posts", {
    method: "POST", body: JSON.stringify({ action, id: initial.id, expectedVersion: 3, assetUrl: initial.assetUrl, at: "2026-10-15T17:00:00Z" }),
  }));
  for (const status of ["publishing", "scheduled"]) {
    state.post.status = status;
    for (const action of ["approve", "unapprove", "skip", "schedule", "markPublished", "setAsset"]) assert.equal((await send(action)).status, 409);
    const edited = await editSocialPost({ socialPost: { findUnique: async () => state.post } } as never, "admin", { id: initial.id, body: "Edit", expectedVersion: 3, trackChanges: true });
    assert.equal(edited.status, 409);
    const graphic = load("src/app/api/admin/social/posts/[id]/graphic/route.ts", mocks);
    assert.equal((await graphic.POST(new NextRequest("https://platform.test/upload", { method: "POST" }), { params: Promise.resolve({ id: initial.id }) })).status, 409);
  }
  state.post.status = "approved"; state.rejectClaim = true;
  for (const action of ["unapprove", "skip", "schedule", "markPublished"]) assert.equal((await send(action)).status, 409);
});

test("company logo changes invalidate approval and cannot race a publish claim", async () => {
  const { state, mocks } = harness(); state.post.stream = "symposium_2026"; state.post.kind = "speaker";
  const removed: string[] = [];
  const route = load("src/app/api/admin/social/posts/[id]/company-logo/route.ts", {
    ...mocks, "@/lib/allocation/symposium-2026": { EVENT_SLUG: "symposium" },
    "@/lib/social/speakers": { SYMPOSIUM_SOCIAL_STREAM: "symposium_2026" },
    "@/lib/social/company-logo": { logoOverride: () => null },
    "@/lib/prisma": { prisma: { ...(mocks["@/lib/prisma"] as { prisma: object }).prisma,
      speaker: { findUnique: async () => ({ event: { slug: "symposium" } }) } } },
    "@/lib/r2": { ...(mocks["@/lib/r2"] as object), deleteR2ObjectByUrl: async (url: string) => { removed.push(url); } },
  });
  const send = () => {
    const form = new FormData(); form.set("logo", new File([Buffer.from("89504e470d0a1a0a", "hex")], "logo.png", { type: "image/png" }));
    return route.POST(new NextRequest("https://platform.test/upload", { method: "POST", body: form }), { params: Promise.resolve({ id: initial.id }) });
  };
  state.post.status = "publishing"; assert.equal((await send()).status, 404); assert.equal(state.uploads, 0);
  state.post.status = "approved"; state.rejectClaim = true;
  assert.equal((await send()).status, 409); assert.equal(removed.length, 1); assert.equal(state.post.status, "approved");
  state.rejectClaim = false;
  assert.equal((await send()).status, 200); assert.equal(state.post.status, "draft"); assert.equal(state.post.approvedAt, null);
});

test("only ready, approved, saved posts offer publishing; sending posts offer a status check", () => {
  const post = { ...initial, scheduledFor: initial.scheduledFor.toISOString(), cycleLabel: "Annual Symposium", stale: false } as unknown as QueuePost;
  const render = (changed: Partial<QueuePost> = {}, ready = true, pending = false) => renderToStaticMarkup(createElement(SocialPublishControls, {
    post: { ...post, ...changed }, connection: { ready, url: "https://publish.buffer.com/company" }, pending, onResult: () => {},
  }));
  assert.match(render(), /Post Annual Symposium to LinkedIn/); assert.doesNotMatch(render(), /disabled=""/);
  for (const html of [render({}, false), render({}, true, true), render({ stale: true })]) assert.match(html, /disabled=""/);
  assert.match(render({ status: "draft" }), /Approve the latest version before scheduling/);
  assert.match(render({ status: "draft" }), /disabled=""/);
  assert.match(render(), /Schedule Annual Symposium/);
  const sending = render({ status: "scheduled", bufferPostId: remote.id });
  assert.match(sending, /Check status/); assert.doesNotMatch(sending, /Post Annual Symposium to LinkedIn/);
  assert.match(sending, /Scheduled for/);
  assert.match(sending, /dateTime="2026-10-15T13:00:00.000Z"/);
});
