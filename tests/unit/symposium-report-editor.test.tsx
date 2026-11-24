import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("the main report editor keeps comments readable and directs new feedback to full-page review", async () => {
  const bundle = await build({
    stdin: {
      contents: 'export { ReportEditor } from "./src/components/workspace/symposium-report/ReportEditor";',
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
      loader: "tsx",
    },
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
    external: ["react", "react-dom", "react-dom/*"],
    plugins: [{ name: "report-editor-server-render", setup(builder) {
      builder.onResolve({ filter: /\.css$/ }, () => ({ path: "styles", namespace: "fixture" }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
      builder.onResolve({ filter: /review-invites$/ }, () => ({ path: "invites", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents:
        path === "styles" ? "export default {};" : path === "router" ? "export const useRouter = () => ({refresh() {}});" :
          "export async function newsletterReviewTeam() {} export async function reportReviewHistory() {} export async function reportReviewRecipients() {} export async function sendReportReviewInvites() {}",
      }));
    } }],
  });
  const editorModule = { exports: {} as { ReportEditor: React.ComponentType<Record<string, unknown>> } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), editorModule, editorModule.exports);

  const props = {
    report: {
      cover: { title: "Report", theme: "Workforce", date: "October 29" },
      pages: [{ id: "summary", label: "Overview", title: "Summary", text: "Report copy", frames: 1 }],
      back: { title: "BioHubNet", text: "Connect" },
    },
    revision: "a".repeat(64), history: [], recommendations: {}, meId: "staff", isAdmin: true,
    review: {
      id: "symposium-2026-event-report", url: "/review/symposium-2026/report", title: "Report", status: "open", round: 1,
      comments: [{
        id: "existing", parentId: null, round: 1, anchorQuote: null, anchorKey: "#report-frame-cover-0",
        anchorPath: null, anchorBlock: null, anchorState: "current", authorUserId: "staff", authorName: "Reviewer",
        authorKind: "user", body: "Existing draft feedback", status: "open", editCount: 0,
        editedAt: null, editedByName: null, createdAt: "2026-11-19T12:00:00Z",
      }],
    },
  };
  const html = renderToStaticMarkup(React.createElement(editorModule.exports.ReportEditor, props));
  assert.match(html, /Existing draft feedback/);
  assert.match(html, /Start Round 1 review/);
  assert.match(html, /href="\/review\/symposium-2026\/report"[^>]*target="_blank"/);
  assert.doesNotMatch(html, /New comment|aria-label="Review comment"/);
  assert.doesNotMatch(html, />\s*(?:Reply|Add comment|Edit|Delete|Resolve)\s*</);
  assert.match(html, /View only\. Use the red/);
  assert.doesNotMatch(html, /Click text or a photo to edit|All changes saved|>Start Round 2<|>Approve report</);
  assert.match(html, /<button[^>]*>.*?Email review request<\/button>/);
  for (const fullPageReview of [false, true]) {
    const locked = renderToStaticMarkup(React.createElement(editorModule.exports.ReportEditor, { ...props, fullPageReview, review: { ...props.review, status: "exported" } }));
    assert.match(locked, /aria-label="Round 1 locked"/);
    assert.match(locked, /Wait until the revisions for Round 1 are complete/);
    assert.match(locked, /Then an administrator can start Round 2/);
    assert.ok(locked.indexOf('aria-label="Round 1 locked"') < locked.indexOf("Shared draft"));
    assert.doesNotMatch(locked, /Click text or a photo to edit/);
  }
  for (const fullPageReview of [false, true]) {
    const ready = renderToStaticMarkup(React.createElement(editorModule.exports.ReportEditor, { ...props, fullPageReview, review: { ...props.review, status: "exported", comments: props.review.comments.map(c => ({...c,status:"resolved"})) } }));
    assert.match(ready,/Round 2 is ready for review/);
    assert.match(ready,/All revision requests are resolved/);
    assert.match(ready,/An administrator must click/);
    assert.match(ready,fullPageReview ? />Start Round 2 review<\/button>/ : />Open Round 2 review<\/a>/);
    assert.doesNotMatch(ready,/All changes saved|>Approve report</);
  }
  const fullPage = renderToStaticMarkup(React.createElement(editorModule.exports.ReportEditor, { ...props, fullPageReview: true }));
  assert.match(fullPage, /Comment mode is on by default\./);
  assert.match(fullPage, /Edits save automatically\./);
  assert.match(fullPage, /All changes saved/);
  assert.doesNotMatch(fullPage, /Save draft|Comment on page/);
  assert.doesNotMatch(fullPage, /Existing draft feedback|Start Round 1 review|id="report-comments"/);
});
