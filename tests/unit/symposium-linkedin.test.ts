import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { changeLinkedinBoard, LinkedinAction, LinkedinBoard, LinkedinInput, linkedinSourceUrl, linkedinEmbedUrl, publicLinkedinTestimonials } from "../../src/lib/events/linkedin";

const at = "2026-11-03T15:00:00.000Z";
const input = () => LinkedinInput.parse({ author: "Example Attendee", sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123?actorCompanyId=102677155", kind: "mention", topic: "symposium", sourceText: "Thank you for the symposium!", reply: "Thank you for joining us!" });
const empty = () => LinkedinBoard.parse({ entries: [], checkedAt: null, coverage: "Not checked" });

test("quote ratings validate, are editable, and survive repeat imports without publishing", () => {
  const assessment = { rating: "great" as const, reason: "Specific industry learning." };
  const imported = changeLinkedinBoard(empty(), { action: "import", entries: [{ ...input(), assessment }], coverage: "Captured public posts" }, "Admin", at);
  assert.deepEqual(imported.entries[0].assessment, assessment);
  assert.equal(imported.entries[0].testimonial, undefined);
  const rated = changeLinkedinBoard(imported, { action: "rate", id: imported.entries[0].id, assessment: { rating: "useful", reason: "Needs event context." } }, "Colleague", at);
  const rescanned = changeLinkedinBoard(rated, { action: "import", entries: [{ ...input(), assessment }], coverage: "Rechecked" }, "Scanner", at);
  assert.equal(rescanned.entries[0].assessment?.rating, "useful");
  assert.equal(rescanned.entries[0].updatedBy, "Colleague");
  assert.equal(rated.entries[0].reply, input().reply);
  assert.equal(imported.entries[0].assessment?.rating, "great");
  assert.throws(() => changeLinkedinBoard(imported, { action: "rate", id: "missing", assessment }, "Admin", at), /no longer/);
  for (const invalid of [{ rating: "excellent", reason: "" }, { rating: "great", reason: "x".repeat(501) }]) assert.equal(LinkedinAction.safeParse({ action: "rate", id: "id", assessment: invalid }).success, false);
  const legacy = changeLinkedinBoard(empty(), { action: "add", entry: input() }, "Admin", at);
  assert.equal(legacy.entries[0].assessment, undefined);
  const published = changeLinkedinBoard(imported, { action: "testimonial", id: imported.entries[0].id, quote: "Thank you for the symposium!", publish: true }, "Admin", at);
  assert.ok(!JSON.stringify(publicLinkedinTestimonials(published)).includes("Specific industry learning"));
  assert.ok(!JSON.stringify(publicLinkedinTestimonials(published)).includes("assessment"));
});

test("native embeds use only public LinkedIn post URNs, not comment tracking or private inbox links", () => {
  for (const kind of ["activity", "share", "ugcPost"]) {
    assert.equal(linkedinEmbedUrl(`https://www.linkedin.com/feed/update/urn:li:${kind}:123/?dashCommentUrn=comment-5`), `https://www.linkedin.com/embed/feed/update/urn:li:${kind}:123`);
  }
  for (const source of ["https://www.linkedin.com/company/102677155/admin/inbox/thread/private", "https://www.linkedin.com:8443/feed/update/urn:li:activity:1", "https://www.linkedin.com.evil.test/feed/update/urn:li:activity:1", "https://www.linkedin.com/feed/update/urn:li:activity:1/extra", "javascript:alert(1)", "not a url"]) assert.equal(linkedinEmbedUrl(source), null);
});

test("source links reject lookalike hosts and unsafe schemes and preserve comment identity", () => {
  for (const url of ["javascript:alert(1)", "https://www.linkedin.com.evil.test/feed/update/123", "http://www.linkedin.com/feed/update/123", "https://user:pass@www.linkedin.com/feed/update/123", "https://www.linkedin.com/jobs/"]) assert.throws(() => linkedinSourceUrl(url));
  const url = linkedinSourceUrl("https://linkedin.com/feed/update/urn:li:activity:123?actorCompanyId=1&dashCommentUrn=comment-5&trk=test");
  assert.equal(url, "https://www.linkedin.com/feed/update/urn:li:activity:123?dashCommentUrn=comment-5");
  assert.notEqual(url, linkedinSourceUrl("https://linkedin.com/feed/update/urn:li:activity:123?dashCommentUrn=comment-6"));
  assert.equal(LinkedinAction.safeParse({ action: "add", entry: { ...input(), reply: "x".repeat(3001) } }).success, false);
});

test("scans deduplicate interactions without resetting colleagues' drafts, status or audit", () => {
  const first = changeLinkedinBoard(empty(), { action: "import", entries: [input(), input()], coverage: "Activity" }, "Ruilin", at);
  assert.equal(first.entries.length, 1);
  assert.equal(first.checkedAt, at);
  const edited = changeLinkedinBoard(first, { action: "edit", id: first.entries[0].id, reply: "My reviewed reply", status: "replied", notes: "Sent manually" }, "Colleague", "2026-11-03T15:01:00.000Z");
  const rescanned = changeLinkedinBoard(edited, { action: "import", entries: [{ ...input(), sourceText: "Updated post", reply: "Generated replacement" }], coverage: "Activity and inbox" }, "Ruilin", "2026-11-03T15:02:00.000Z");
  assert.equal(rescanned.entries[0].reply, "My reviewed reply");
  assert.equal(rescanned.entries[0].status, "replied");
  assert.equal(rescanned.entries[0].updatedBy, "Colleague");
  assert.equal(rescanned.entries[0].sourceText, "Updated post");
  assert.equal(edited.entries[0].sourceText, input().sourceText);
  assert.throws(() => changeLinkedinBoard(first, { action: "add", entry: input() }, "Admin", at), /already/);
  assert.throws(() => changeLinkedinBoard(first, { action: "edit", id: "missing", reply: "", status: "pending", notes: "" }, "Admin", at), /no longer/);
});

let row: { value: string; updatedAt: Date } | null = null, race = false, fail = false;
Reflect.set(globalThis, "prisma", { platformSetting: {
  findUnique: async () => { if (fail) throw new Error("Offline"); return row; },
  create: async ({ data }: { data: NonNullable<typeof row> }) => { if (row || race) throw Object.assign(new Error("Exists"), { code: "P2002" }); row = data; return data; },
  updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: NonNullable<typeof row> }) => { if (race || row?.updatedAt.toISOString() !== where.updatedAt.toISOString()) return { count: 0 }; row = data; return { count: 1 }; },
} });
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: new URL("../fixtures/people-route-auth.cjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const route = import("../../src/app/api/admin/symposium-linkedin/route").finally(() => hooks.deregister());
const origin = "https://platform.example.org";
const request = (version: string | null = null, source = origin) => new Request(origin + "/api/admin/symposium-linkedin", { method: "POST", headers: { origin: source }, body: JSON.stringify({ version, change: { action: "add", entry: input() } }) });

test("queue is admin-only and same-origin, with bounded input and no writes from GET", async () => {
  const { GET, POST } = await route;
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await GET()).status, 403); assert.equal((await POST(request())).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin", name: "Admin A" } });
  assert.equal((await POST(request(null, "https://evil.test"))).status, 403);
  assert.equal((await POST(new Request(origin + "/api/admin/symposium-linkedin", { method: "POST", headers: { origin }, body: "{" }))).status, 400);
  assert.equal((await POST(new Request(origin + "/api/admin/symposium-linkedin", { method: "POST", headers: { origin }, body: "x".repeat(1_000_001) }))).status, 413);
  assert.equal((await GET()).headers.get("cache-control"), "private, no-store"); assert.equal(row, null);
});

test("shared saves reject stale versions and creation/update races without overwriting", async () => {
  const { GET, POST } = await route;
  const added = await POST(request()); assert.equal(added.status, 200);
  const first = (await added.json()).snapshot;
  assert.equal(first.board.entries[0].updatedBy, "Admin A");
  assert.equal((await POST(request())).status, 409);
  race = true;
  const edit = { version: first.version, change: { action: "edit", id: first.board.entries[0].id, reply: "Reviewed reply", status: "pending", notes: "" } };
  const response = await POST(new Request(origin + "/api/admin/symposium-linkedin", { method: "POST", headers: { origin }, body: JSON.stringify(edit) }));
  assert.equal(response.status, 409); assert.equal((await response.json()).snapshot.board.entries[0].reply, input().reply);
  race = false;
  assert.equal((await POST(new Request(origin + "/api/admin/symposium-linkedin", { method: "POST", headers: { origin }, body: JSON.stringify(edit) }))).status, 200);
  assert.equal((await (await GET()).json()).board.entries[0].reply, "Reviewed reply");
  row = null; race = true; assert.equal((await POST(request())).status, 409); race = false;
});

test("offline and corrupt data fail visibly rather than resetting the board", async () => {
  const { GET, POST } = await route;
  fail = true; assert.equal((await GET()).status, 503); assert.equal((await POST(request())).status, 503); fail = false;
  row = { value: "broken", updatedAt: new Date(at) };
  assert.equal((await GET()).status, 503); assert.equal((await POST(request())).status, 503);
  assert.equal(row.value, "broken");
});
