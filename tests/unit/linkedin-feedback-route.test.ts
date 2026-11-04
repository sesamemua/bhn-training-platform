import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
import { LinkedinBoard, LinkedinInput, changeLinkedinBoard, publicLinkedinTestimonials } from "../../src/lib/events/linkedin";

test("publication stays admin-only, validates excerpts and uses optimistic locking without replacing drafts", async () => {
  const at = "2026-11-04T18:00:00.000Z";
  const board = changeLinkedinBoard(LinkedinBoard.parse({ entries: [], checkedAt: null, coverage: "Internal" }), { action: "add", entry: LinkedinInput.parse({ author: "Attendee", kind: "comment", topic: "symposium", sourceUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123?dashCommentUrn=comment-1", sourceText: "Such useful connections!", reply: "Private draft" }) }, "Admin", at);
  let row = { value: JSON.stringify(board), updatedAt: new Date(at) };
  Reflect.set(globalThis, "prisma", { platformSetting: {
    findUnique: async () => row,
    updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: typeof row }) => { if (where.updatedAt.getTime() !== row.updatedAt.getTime()) return { count: 0 }; row = data; return { count: 1 }; },
  } });
  const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === "@/lib/auth" ? { url: new URL("../fixtures/people-route-auth.cjs", import.meta.url).href, shortCircuit: true } : next(specifier, context); } });
  const { POST } = await import("../../src/app/api/admin/symposium-linkedin/route").finally(() => hooks.deregister());
  const request = (version: string, quote = "Such useful connections!", publish = true, origin = "https://platform.test") => new Request("https://platform.test/api/admin/symposium-linkedin", { method: "POST", headers: { origin }, body: JSON.stringify({ version, change: { action: "testimonial", id: board.entries[0].id, quote, publish } }) });
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await POST(request(at))).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "curator", name: "Curator" } });
  assert.equal((await POST(request(at, undefined, true, "https://elsewhere.test"))).status, 403);
  assert.equal((await POST(request(at, "Invented praise"))).status, 400);
  const result = await POST(request(at)); assert.equal(result.status, 200);
  const saved = (await result.json()).snapshot;
  assert.equal(publicLinkedinTestimonials(saved.board).length, 1);
  assert.equal(saved.board.entries[0].reply, "Private draft");
  assert.equal(saved.board.entries[0].testimonial.publishedBy, "Curator");
  assert.equal((await POST(request(at, "", false))).status, 409);
  assert.equal((await POST(request(saved.version, "", false))).status, 200);
  assert.deepEqual(publicLinkedinTestimonials(LinkedinBoard.parse(JSON.parse(row.value))), []);
});
