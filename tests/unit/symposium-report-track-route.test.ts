import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as documentModule from "../../src/lib/symposium-report/document";
import * as paginateModule from "../../src/lib/symposium-report/paginate";
import * as changesModule from "../../src/lib/symposium-report/changes";
import { createHash } from "node:crypto";
const reportRevision = (text: string) => createHash("sha256").update(text).digest("hex");

function loadRoute(mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const source = readFileSync("src/app/api/workspace/symposium-2026/report/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  return exports;
}

const base = {
  cover: { title: "Annual Symposium", theme: "Future workforce", date: "October 29" },
  pages: [{ id: "summary", label: "Overview", title: "Summary", text: "Original passage", frames: 1 }],
  back: { title: "BioHubNet", text: "Connect" },
};

test("saving the report logs who changed which text; reading changes is staff-only", async () => {
  let stored = JSON.stringify(base);
  let signedIn = true;
  const audits: any[] = [];
  let auditQuery: any;
  const tx = {
    pageReview: {
      findUnique: async () => ({ id: documentModule.REPORT_ID, round: 1, status: "open", pastedHtml: stored }),
      update: async ({ data }: any) => { stored = data.pastedHtml; },
    },
    symposiumReportAsset: { count: async () => 0 },
    auditLog: { create: async ({ data }: any) => { audits.push(data); } },
  };
  const route = loadRoute({
    "@/lib/auth": { requireRole: async () => signedIn ? { user: { id: "yoojin", role: "instructor" } } : null },
    "@/lib/symposium-report/document": documentModule,
    "@/lib/symposium-report/paginate": paginateModule,
    "@/lib/symposium-report/changes": changesModule,
    "@/lib/symposium-report/store": { reportRevision, reportTransaction: (run: any) => run(tx) },
    "@/lib/prisma": { prisma: {
      pageReview: { findUnique: async () => ({ round: 1 }) },
      pageReviewVersion: { findUnique: async () => null },
      auditLog: { findMany: async (args: any) => { auditQuery = args; return audits.map((a, i) => ({ id: String(i), createdAt: new Date(), detail: a.detail, actor: { name: "Yoo Jin", email: null } })); } },
    } },
  });
  const save = (report: unknown) => route.POST(new Request("https://x.test", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save", round: 1, revision: reportRevision(stored), report }),
  }));

  const edited = { ...base, pages: [{ ...base.pages[0], text: "Revised passage" }] };
  assert.equal((await save(edited)).status, 200);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorId, "yoojin");
  assert.equal(audits[0].action, "symposium.report.edit");
  assert.deepEqual(JSON.parse(audits[0].detail), { round: 1, changes: [{ key: "page:summary:text", label: "Summary · text", before: "Original passage", after: "Revised passage" }] });
  assert.equal((await save(edited)).status, 200, "saving again with no text change");
  assert.equal(audits.length, 1, "writes no change record");

  const body = await (await route.GET()).json();
  assert.equal(auditQuery.where.action, "symposium.report.edit");
  assert.match(auditQuery.where.detail.contains, /"round":1,/);
  assert.equal(body.since, "tracking");
  assert.equal(body.baseline["page:summary:text"], "Original passage");
  assert.equal(body.edits[0].author, "Yoo Jin");
  signedIn = false;
  assert.equal((await route.GET()).status, 403);
});
