import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

test("print requests restrict recipients, preserve batches, include notes and deduplicate delivery", async () => {
  let authorized = true, configured = true, activeRecipient = true, jobStatus = "ready", exists = true, failMail = false, failAudit = false;
  const mail: any[] = [], audits = new Map<string, any>();
  const id = "00000000-0000-4000-8000-000000000001";
  const nextId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const who = { id: "colleague", name: "Colleague", email: "colleague@example.org" };
  const api: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return authorized ? { user: { id: "actor", name: "Ruilin", email: "ruilin@example.org" } } : null; } },
    "@/lib/mail": { mailConfigured: () => configured, sendMail: async (message: unknown) => { if (failMail) throw new Error("SMTP failed"); mail.push(message); } },
    "./print-store": { printJobPdf: async (jobId: string) => {
      assert.equal(jobId, id);
      return exists ? { job: { label: "Wi-Fi tents", status: jobStatus, kind: "tents", copies: 22, notes: "Please use white stock." }, bytes: Buffer.from("PDF") } : null;
    } },
    "@/lib/prisma": { prisma: {
      user: {
        findMany: async ({ where }: any) => { assert.deepEqual(where, { role: { in: ["admin", "superadmin"] }, isActive: true, accountKind: "real" }); return [who]; },
        findFirst: async ({ where }: any) => {
          assert.equal(where.isActive, true); assert.deepEqual(where.role.in, ["admin", "superadmin"]);
          assert.equal(where.accountKind, "real", "demo accounts cannot receive print requests");
          return activeRecipient && where.id === who.id ? who : null;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          if (audits.has(data.id)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
          audits.set(data.id, { ...data, createdAt: new Date("2026-10-22T16:00:00Z") });
        },
        update: async ({ where, data }: any) => { if (failAudit) throw new Error("Audit unavailable"); Object.assign(audits.get(where.id), data); },
        findMany: async ({ where, take }: any) => {
          assert.deepEqual(where, { action: "symposium.print.request", targetType: "printJob", targetId: id });
          assert.equal(take, 20); return [...audits.values()];
        },
      },
    } },
  };
  const compiled = ts.transpileModule(readFileSync("src/lib/events/print-requests.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const require = createRequire(import.meta.url);
  new Function("require", "exports", compiled)((name: string) => mocks[name] ?? require(name), api);
  const input = { jobId: id, recipientId: who.id, note: "Leave 22 copies at reception.\nThank you!", requestId: nextId(2) };

  authorized = false;
  assert.equal((await api.printRequestDetails(id)).error, "Forbidden");
  assert.equal((await api.requestPrint(input)).error, "Forbidden");
  assert.equal(audits.size, 0);
  authorized = true;
  assert.match((await api.printRequestDetails("bad")).error, /Invalid/);
  for (const invalid of [{ ...input, jobId: "bad" }, { ...input, requestId: "bad" }, { ...input, note: "a".repeat(1001) }]) {
    assert.match((await api.requestPrint(invalid)).error, /Choose a colleague/);
  }
  configured = false;
  assert.match((await api.requestPrint(input)).error, /not configured/);
  configured = true; activeRecipient = false;
  assert.match((await api.requestPrint(input)).error, /active admin/);
  activeRecipient = true;
  assert.match((await api.requestPrint({ ...input, recipientId: "outsider", email: "hacker@example.org" })).error, /active admin/);
  for (const status of ["printed", "cancelled"]) {
    jobStatus = status; assert.match((await api.requestPrint(input)).error, /no longer ready/);
  }
  jobStatus = "ready"; exists = false;
  assert.match((await api.requestPrint(input)).error, /no longer ready/);
  exists = true;
  assert.equal(mail.length, 0); assert.equal(audits.size, 0);

  const result = await api.requestPrint({ ...input, email: "hacker@example.org" });
  assert.equal(result.sent.status, "sent");
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, who.email);
  assert.equal(mail[0].replyTo, "ruilin@example.org");
  assert.equal(mail[0].signature, false);
  assert.equal(mail[0].attachments, undefined);
  assert.match(mail[0].text, /Leave 22 copies at reception/);
  assert.match(mail[0].text, /Please use white stock/);
  assert.match(mail[0].text, /22 copies already included.*Print the PDF once/);
  assert.match(mail[0].text, /Fold each sheet/);
  assert.match(mail[0].text, new RegExp(`/symposium-2026/print\\?job=${id}`));
  assert.match(mail[0].text, /does not mark anything printed/);
  assert.equal(jobStatus, "ready");
  assert.equal(audits.get(input.requestId).actorId, "actor");
  assert.equal(JSON.parse(audits.get(input.requestId).detail).note, input.note);
  assert.match((await api.requestPrint(input)).error, /already submitted/);
  assert.equal(mail.length, 1, "replayed action must not send a second email");
  assert.equal((await api.printRequestDetails(id)).requests[0].status, "sent");

  failMail = true;
  assert.match((await api.requestPrint({ ...input, requestId: nextId(3) })).error, /could not be confirmed/);
  assert.equal(JSON.parse(audits.get(nextId(3)).detail).status, "unconfirmed");
  failMail = false; failAudit = true;
  const uncertain = await api.requestPrint({ ...input, requestId: nextId(4) });
  assert.equal(uncertain.sent.status, "sent");
  assert.match(uncertain.warning, /Do not resend/);
  assert.equal(mail.length, 2);
});

test("a colleague's selected print batch survives sign-in without accepting arbitrary redirect targets", async () => {
  const require = createRequire(import.meta.url);
  const api: Record<string, any> = {};
  let callback = "";
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => null, deniedRedirect: async (path: string) => { callback = path; return "/login"; } },
    "next/navigation": { redirect: () => { throw new Error("redirect"); } },
    "@/components/ui/PageHero": {}, "@/components/workspace/FullWidthWhenCollapsed": {}, "@/components/admin/events/SymposiumPrintJobs": {},
  };
  const compiled = ts.transpileModule(readFileSync("src/app/(dashboard)/admin/workspace/symposium-2026/print/page.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "exports", compiled)((name: string) => mocks[name] ?? require(name), api);
  const id = "00000000-0000-4000-8000-000000000001";
  await assert.rejects(api.default({ searchParams: Promise.resolve({ job: id }) }), /redirect/);
  assert.equal(callback, `/admin/workspace/symposium-2026/print?job=${id}`);
  for (const job of [undefined, "https://evil.example", [id], "../secret"]) {
    await assert.rejects(api.default({ searchParams: Promise.resolve({ job }) }), /redirect/);
    assert.equal(callback, "/admin/workspace/symposium-2026/print");
  }
});
