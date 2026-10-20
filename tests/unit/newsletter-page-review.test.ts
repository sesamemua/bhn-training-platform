import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsletterPageReview } from "../../src/components/workspace/NewsletterPageReview";
import { overlaySource } from "../../src/lib/page-review/overlay-source";

test("newsletter revisions reuse one review and preserve comments, identity and share link", async () => {
  let authorized = true;
  let exists = true;
  let writes = 0;
  let row: Record<string, any> | null = null;
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync("src/app/api/workspace/newsletter/[id]/review/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return authorized ? { user: { id: "editor" } } : null; } },
    "@/lib/prisma": { prisma: {
      newsletterIssue: { findUnique: async () => exists ? { title: "October Newsletter" } : null },
      pageReview: {
        upsert: async ({ where, create, update }: any) => {
          assert.equal(where.id, "newsletter-issue-1");
          assert.deepEqual(update, {});
          if (!row) { row = { ...create, round: 1, status: "open", comments: [{ id: "thread-1", status: "open" }] }; writes++; }
          return { id: row!.id, round: row!.round, status: row!.status };
        },
        findUnique: async () => row && { ...row },
        updateMany: async ({ where, data }: any) => {
          if (!row || row.round !== where.round || row.status === "closed") return { count: 0 };
          const round = row.round + data.round.increment;
          row = { ...row, ...data, round }; writes++; return { count: 1 };
        },
      },
    } },
  };
  const exports: { POST?: (request: Request, context: unknown) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const call = (body: unknown) => exports.POST!(new Request("https://bhn.example/api/workspace/newsletter/issue-1/review", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "issue-1" }) });

  authorized = false;
  assert.equal((await call({ action: "open", html: "first" })).status, 403);
  assert.equal(writes, 0);
  authorized = true;
  assert.equal((await call({ action: "open", html: "" })).status, 400);
  assert.equal((await call({ action: "open", html: "a".repeat(1_000_001) })).status, 400);
  exists = false;
  assert.equal((await call({ action: "open", html: "first" })).status, 404);
  exists = true;
  const first = await (await call({ action: "open", html: "first" })).json();
  const token = row!.shareToken;
  await call({ action: "open", html: "should not overwrite" });
  assert.equal(writes, 1);
  assert.equal(row!.pastedHtml, "first");
  const revised = await (await call({ action: "revise", html: "second", round: 1 })).json();
  assert.equal(revised.review.id, first.review.id);
  assert.equal(revised.review.round, 2);
  assert.equal(row!.snapshotHtml, "first");
  assert.equal(row!.pastedHtml, "second");
  assert.equal(row!.shareToken, token);
  assert.deepEqual(row!.comments, [{ id: "thread-1", status: "open" }]);
  assert.equal((await call({ action: "revise", html: "stale", round: 1 })).status, 409);
  assert.equal((await call({ action: "revise", html: "missing round" })).status, 409);
  await call({ action: "revise", html: "second", round: 2 });
  assert.equal(writes, 2, "unchanged content does not add a round");
  row!.status = "closed";
  assert.equal((await call({ action: "revise", html: "third", round: 2 })).status, 409);
});

test("pasted overlays use the signed-in launch identity only for the matching review", () => {
  const prefix = overlaySource("https://bhn.example/api/public/page-review/my-token", "Issue").split("  var state = {")[0];
  for (const [token, expected] of [["my-token", "signed-viewer"], ["other-token", ""]]) {
    const context = { URLSearchParams, window: { location: { hash: `#bhn-review=${token}&bhn-reviewer=signed-viewer` } }, document: { currentScript: null }, captured: "" };
    vm.runInNewContext(prefix + "globalThis.captured = credential;})();", context);
    assert.equal(context.captured, expected);
  }
});

test("newsletter uses the existing overlay and revision endpoint while retaining earlier notes and sign-off", () => {
  const client = readFileSync("src/components/workspace/NewsletterPageReview.tsx", "utf8");
  const page = readFileSync("src/app/(dashboard)/admin/workspace/marketing/newsletter/review/page.tsx", "utf8");
  assert.match(client, /\/api\/workspace\/page-review\/\$\{encodeURIComponent\(review.id\)\}\/launch/);
  assert.match(client, /Save revision/);
  assert.match(client, /Mailchimp HTML/);
  assert.match(page, /<SignOff /);
  assert.match(page, /Earlier newsletter notes/);
  assert.match(page, /<PastedNewsletterReview/);
  assert.match(page, /pastedReview\?\.title.toLowerCase\(\).includes\(issue.dateline.toLowerCase\(\)\)/);
  assert.match(page, /initialPaste=\{review\?\.pastedHtml \?\?/);
  assert.match(page, /pastedReview && pastedReview.notes.length > 0/);
  assert.match(client, /useState\(initialPaste\)/);
});

test("newsletter code is hidden by default and review opens as a full page, not an embed", () => {
  for (const canEdit of [true, false]) {
    const markup = renderToStaticMarkup(createElement(NewsletterPageReview, {
      issueId: "october", html: "<p>Generated version</p>", initialPaste: "<p>Latest saved newsletter</p>",
      initialReview: { id: "newsletter-october", round: 9, status: "open" }, canEdit,
    }));
    assert.match(markup, /Version 9/);
    assert.match(markup, /Open full-page review/);
    assert.match(markup, /href="\/api\/workspace\/page-review\/newsletter-october\/launch" target="_blank" rel="noopener noreferrer"/);
    assert.match(markup, /View code/);
    assert.match(markup, /Copy Mailchimp code/);
    assert.match(markup, /aria-expanded="false" aria-controls="newsletter-code-october"/);
    assert.doesNotMatch(markup, /<iframe|<textarea|Latest saved newsletter|Generated version|Your name/);
    assert.equal(markup.includes("Save revision"), canEdit);
  }
});

test("newsletter reviews never offer name entry or mint guest credentials", async () => {
  const source = overlaySource("https://bhn.example/api/public/page-review/token", "Issue", true);
  assert.match(source, /var accountRequired = true/);
  assert.ok(source.indexOf("&& accountRequired") < source.indexOf('nameInput.placeholder = "Your name"'));
  const require = createRequire(import.meta.url);
  let minted = false;
  const compiled = ts.transpileModule(readFileSync("src/app/api/public/page-review/[token]/join/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mocks: Record<string, unknown> = {
    "@/lib/prisma": { prisma: { pageReview: { findUnique: async () => ({ id: "newsletter-issue-1", status: "open", title: "October" }) } } },
    "@/lib/page-review/viewer": { createAnonViewerToken: async () => { minted = true; return "guest"; } },
  };
  const exports: { POST?: (req: Request, ctx: unknown) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const response = await exports.POST!(new Request("https://bhn.example/join", { method: "POST", body: JSON.stringify({ name: "Guest" }) }), { params: Promise.resolve({ token: "token" }) });
  assert.equal(response.status, 403);
  assert.equal(minted, false);
});
