import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

test("missing-email edits are admin-only, validated, audited, conflict-safe and never send mail", async () => {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync("src/app/(dashboard)/admin/workspace/training-admin/email-actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  let admin = true, duplicate = false, race = false, reads = 0;
  let row = { id: "one", email: null as string | null, data: { full_name: "Test Attendee", __coordinator: true, keep: "untouched" } as Record<string, unknown>, form: { slug: "training-week-registration-2026-v2" }, user: null as { email: string } | null };
  const writes: unknown[] = [], audits: { action: string; detail: string; actorId: string }[] = [];
  const tx = { eventFormSubmission: {
    findUnique: async () => { reads++; return structuredClone(row); },
    findFirst: async () => duplicate ? { id: "other" } : null,
    updateMany: async ({ where, data }: { where: { data: { equals: unknown }; email: string | null }; data: { email: string; data: Record<string, unknown> } }) => {
      assert.deepEqual(where.data.equals, row.data); assert.equal(where.email, row.email);
      if (race) return { count: 0 }; writes.push(data); row = { ...row, ...data }; return { count: 1 };
    },
  }, auditLog: { create: async ({ data }: { data: typeof audits[number] }) => { audits.push(data); } } };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => admin ? { user: { id: "admin-a" } } : null },
    "@/lib/prisma": { prisma: { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/allocation/symposium-2026": { REGISTRATION_FORM_SLUG: "training-week-registration-2026", REGISTRATION_FORM_WHERE: {} },
    "@/lib/formbuilder/innovation-ignited": { INNOVATION_IGNITED_SLUG: "innovation-ignited-2026" },
    "@/lib/formbuilder/versions": { versionRoot: (slug: string) => slug.replace(/-v\d+$/, "") },
  };
  const exports = {} as { addRegistrantEmail: (id: string, email: string) => Promise<{ ok: boolean; problem?: string }> };
  new Function("require", "exports", compiled)((id: string) => { if (/mail|acknowledge/.test(id)) throw new Error("Must not send mail"); return mocks[id] ?? require(id); }, exports);
  const save = (email = " Person@Example.org ") => exports.addRegistrantEmail("one", email);
  admin = false; assert.equal((await save()).ok, false); assert.equal(reads, 0);
  admin = true; assert.equal((await save("not-an-email")).ok, false); assert.equal(reads, 0);
  row.form.slug = "talent-application"; assert.equal((await save()).ok, false);
  row.form.slug = "innovation-ignited-2026";
  duplicate = true; assert.equal((await save()).ok, false); assert.equal(writes.length, 0); duplicate = false;
  race = true; assert.equal((await save()).ok, false); assert.equal(audits.length, 0); race = false;
  assert.equal((await save()).ok, true); assert.equal(row.email, "person@example.org");
  assert.deepEqual(row.data, { full_name: "Test Attendee", __coordinator: true, keep: "untouched", trainee_email: "person@example.org" });
  assert.equal(audits.length, 1); assert.equal(audits[0].actorId, "admin-a"); assert.equal(JSON.parse(audits[0].detail).sentEmail, false);
  assert.equal((await save("other@example.org")).ok, false); assert.equal(writes.length, 1);
  row.email = null; row.data = { trainee_email: "existing@example.org" }; assert.equal((await save()).ok, false);
  row.data = {}; row.user = { email: "account@example.org" }; assert.equal((await save()).ok, false);
});
