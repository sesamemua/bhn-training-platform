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
  const fullPage = renderToStaticMarkup(React.createElement(editorModule.exports.ReportEditor, { ...props, fullPageReview: true }));
  assert.match(fullPage, /Click text to edit it, then save the draft/);
  assert.match(fullPage, /Use Comment on page to leave feedback/);
  assert.doesNotMatch(fullPage, /Existing draft feedback|Start Round 1 review|id="report-comments"/);
});
