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
    assert.match(markup, /Round 9/);
    assert.match(markup, /Open full-page review/);
    assert.match(markup, /href="\/api\/workspace\/page-review\/newsletter-october\/launch" target="_blank" rel="noopener noreferrer"/);
    assert.match(markup, /View code/);
    assert.match(markup, /Copy Mailchimp code/);
    assert.match(markup, /aria-expanded="false" aria-controls="newsletter-code-october"/);
    assert.doesNotMatch(markup, /<iframe|<textarea|Latest saved newsletter|Generated version|Your name/);
    assert.equal(markup.includes("Save revision"), canEdit);
  }
});

test("comparison loads once per round, respects dismissal, and opens again for the next round", async () => {
  const source = overlaySource("https://review.test/api/public/page-review/token", "Issue");
  const parsed = ts.createSourceFile("overlay.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions: string[] = [];
  function collect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && ["loadComparison", "comparisonKey", "endpointKey"].includes(node.name?.text ?? "")) functions.push(node.getText(parsed));
    ts.forEachChild(node, collect);
  }
  collect(parsed);
  let reads = 0, opens = 0;
  const dismissed = new Set<string>();
  const state = { review: { round: 1 }, comparisonRound: null as number | null, comparison: null, comparisonError: "" };
  const context = vm.createContext({
    state, endpoint: "https://review.test/api/public/page-review/token", credential: "viewer", comparisonDialog: null, comparisonCleanup: null,
    sessionStorage: { getItem: (key: string) => dismissed.has(key) ? "1" : null },
    render() {}, openComparison() { opens++; },
    fetch: async (url: string, options: { headers: Record<string, string> }) => {
      reads++;
      assert.equal(url, "https://review.test/api/public/page-review/token?comparison=1");
      assert.equal(options.headers.Authorization, "Bearer viewer");
      return { ok: true, json: async () => ({ ok: true, review: { round: state.review.round }, comparison: { beforeHtml: "before", afterHtml: "after" } }) };
    },
  });
  vm.runInContext(functions.join("\n"), context);
  const load = () => vm.runInContext("loadComparison()", context);
  await load();
  assert.equal(reads, 0, "first round has no previous version");
  state.review.round = 2;
  await load();
  assert.equal(opens, 1);
  await load();
  assert.equal(reads, 1, "polling never refetches snapshots or reopens a closed dialog");
  dismissed.add("bhn-review-comparison-dismissed:token:2");
  state.comparisonRound = null;
  await load();
  assert.equal(opens, 1, "saved dismissal is respected when storage is available");
  state.review.round = 3;
  await load();
  assert.equal(opens, 2, "new round opens its own comparison");
  assert.match(source, /frame\.setAttribute\("sandbox", "allow-scripts"\)/);
  assert.doesNotMatch(source, /allow-same-origin/);
  assert.match(source, /script-src 'sha256-/);
  assert.match(source, /frame\.setAttribute\("referrerpolicy", "no-referrer"\)/);
  assert.match(source, /Previous rounds · /);
  assert.match(source, /history\.open = state\.historyExpanded/);
  assert.match(source, /comment\.round < state\.review\.round && !state\.historyExpanded/);
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

test("the review launch CTA is prominent, has finite motion, and maintains text contrast", () => {
  const html = renderToStaticMarkup(createElement(NewsletterPageReview, {
    issueId: "october", html: "", initialReview: { id: "newsletter-october", round: 1, status: "open" }, canEdit: true,
  }));
  assert.match(html, /class="newsletter-review-launch"/);
  const css = readFileSync("src/app/globals.css", "utf8");
  const rule = css.match(/\.newsletter-review-launch \{([^}]+)\}/)![1];
  assert.match(rule, /min-height: 52px/);
  assert.match(rule, /font-size: 15px/);
  assert.match(rule, /background: #b8364c/);
  assert.match(css, /animation: newsletter-review-sheen 1\.8s ease-in-out 2;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.newsletter-review-launch \{ transition: none; transform: none; \}\s*\.newsletter-review-launch::before \{ animation: none; display: none; \}/);
  const base = [184, 54, 76];
  for (const rgb of [base, [163, 46, 67], base.map((c) => c * .9 + 255 * .1)]) {
    const linear = rgb.map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    assert.ok(1.05 / (luminance + .05) >= 4.5, "white text passes AA even at the peak highlight");
  }
});
