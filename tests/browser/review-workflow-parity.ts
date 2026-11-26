import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { overlaySource } from "../../src/lib/page-review/overlay-source";
import { socialCopySnapshotHtml } from "../../src/lib/social/copy-review";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    page.setDefaultTimeout(8000);
    const root = "https://review-fixtures.test";
    const endpoint = root + "/api/workspace/social-review/demo";
    const mutate = root + "/api/workspace/page-review/social-copy-demo";
    const review = { title: "Event post", round: 2, status: "open" };
    const threads: Record<string, unknown>[] = [];
    const snapshots = [{ round: 1, body: "Original workshop copy" }, { round: 2, body: "Updated workshop copy" }]
      .map(({ round, body }) => ({ round, html: socialCopySnapshotHtml(JSON.stringify({ title: review.title, body })) }));
    await page.route(root + "/social", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><body>
      <a href="#editor">Open post editor</a><div data-social-review><div id="social-copy-draft"><article data-copy-page data-copy-editable="true" data-copy-version="6" aria-label="Event post"><p data-copy-part="0">Updated workshop copy</p></article></div></div>
      <script data-round="2">${overlaySource(endpoint, "Social Post Review", true, mutate, "social")}</script></body>` }));
    await page.route(endpoint + "**", (route) => route.fulfill({ json: route.request().url().includes("comparison=1")
      ? { ok: true, review, comparison: { versions: snapshots, beforeHtml: snapshots[0].html, afterHtml: snapshots[1].html, availableRounds: [1, 2] } }
      : { ok: true, review, comments: threads, viewer: { name: "Signed-in reviewer" } } }));
    await page.route(mutate, async (route) => {
      const input = route.request().postDataJSON();
      assert.equal(input.expectedRound, 2);
      if (input.action === "addComment") {
        assert.equal(input.anchorQuote, "Updated workshop copy");
        assert.equal(input.anchorKey, "#social-copy-draft");
        threads.push({ ...input, id: "comment", round: 2, status: "open", authorName: "Signed-in reviewer", createdAt: "2026-11-17T19:00:00Z" });
      } else if (input.action === "setStatus") threads[0].status = "resolved";
      else assert.fail("Unexpected mutation");
      return route.fulfill({ json: { ok: true, review: { comments: threads } } });
    });
    await page.goto(root + "/social");
    await page.getByRole("button", { name: "Before / after comparison" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.frameLocator('iframe[title="Before · Round 1"]').locator("mark").filter({ hasText: "Original" })).toBeVisible();
    await page.getByRole("button", { name: /close/i }).click();
    await page.getByRole("link", { name: "Open post editor" }).click();
    assert.match(page.url(), /#editor$/);
    await page.getByText("Updated workshop copy", { exact: true }).click();
    await page.getByRole("menuitem", { name: "Comment on element" }).click();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Verify the workshop wording.");
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(page.locator('[data-thread-id="comment"]')).toContainText("Verify the workshop wording.");
    await page.getByRole("button", { name: "Show comment 1 on page" }).click();
    await expect(page.locator(".bhn-review-highlight")).toBeVisible();
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
    const paragraph = page.locator("[data-copy-part]");
    await paragraph.click();
    await page.getByRole("menuitem", { name: "Quick edit", exact: true }).click();
    const quick = page.getByRole("group", { name: "Quick edit" }).getByRole("textbox");
    await quick.fill("Polished workshop copy"); await quick.press("Enter");
    await expect(paragraph).toHaveText("Polished workshop copy");
    await page.getByRole("button", { name: "Discard edits" }).click();
    await expect(paragraph).toHaveText("Updated workshop copy");

    const site = root + "/website", siteApi = root + "/website-comments";
    const siteWrites: unknown[] = [];
    await page.route(site, route => route.fulfill({ contentType: "text/html", body: `<!doctype html><body><main><p>Learn about <a href="/workshops">Workshops</a>.</p><form><button type="button" onclick="this.textContent='Form still works'">Test form button</button></form></main><script data-viewer="signed">${overlaySource(siteApi, "Website review", false, null, "report", { website: true })}</script></body>` }));
    await page.route(siteApi + "**", route => {
      if (route.request().method() !== "GET") siteWrites.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, review, comments: [], viewer: { name: "Reviewer", canResolve: false } } });
    });
    await page.goto(site);
    await expect(page.getByRole("group", { name: "Review controls" })).toBeVisible();
    await page.getByRole("link", { name: "Workshops" }).click();
    await expect(page.getByRole("menuitem", { name: "Open link", exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: "Suggest text", exact: true }).click();
    const suggestion = page.getByRole("dialog", { name: "Suggest text" });
    await expect(suggestion.getByRole("textbox")).toHaveValue("Learn about Workshops.");
    await suggestion.getByRole("textbox").fill("Explore our training workshops.");
    await suggestion.getByRole("button", { name: "Continue to comment" }).click();
    await expect(page.getByRole("textbox", { name: "New review comment" })).toHaveValue("Suggested replacement:\nExplore our training workshops.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("link", { name: "Workshops" })).toBeVisible();
    await page.getByRole("button", { name: "Test form button" }).click();
    await expect(page.getByRole("button", { name: "Form still works" })).toBeVisible();
    assert.equal(siteWrites.length, 0, "suggestions never edit the site or post without confirmation");

    const mockActions = "addDesignPin deleteDesignPin editDesignPin lockDesignRound markDesignSeen replyDesignPin requestDesignReview resolveDesignPin setDesignApproval setDesignOk startDesignRound".split(" ").map((name) => `export async function ${name}(){return {ok:true}}`).join("\n");
    const bundle = await build({
      stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
        import {createRoot} from "react-dom/client";
        import {DesignArtworkView} from "./src/components/workspace/DesignArtworkView";
        const page = (round) => ({url:"/asset-"+round+".png",key:"design-review/"+round+".png",w:560,h:320});
        createRoot(document.getElementById("root")).render(<DesignArtworkView fullPage me={{id:"author", name:"Author", admin:true}}
          approver={null} artwork={{id:"fixture",title:"Poster",description:"",project:"Team",round:4,pages:[page(4)],locked:false,
          versions:[1,2,3].map(round=>({round,pages:[page(round)]})),approval:"pending",approvalNote:"",approvalAt:null,reviewers:[],
          pins:[{id:"old",round:1,page:0,x:.5,y:.5,authorId:"author",authorName:"Author",body:"Move the old logo",status:"open",parentId:null,createdAt:"2026-11-17"}]}}/>);
      ` },
      jsx: "automatic", write: false, bundle: true, format: "iife",
      plugins: [{ name: "fixture-actions", setup(build) {
        build.onResolve({ filter: /^(next\/navigation|@\/lib\/(design-review\/(actions|review-tools)|newsletter\/review-invites))$/ }, ({ path }) => ({ path, namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents:
          path === "next/navigation" ? "export const useRouter=()=>({refresh(){}})"
          : path.endsWith("/actions") ? mockActions
          : path.endsWith("/review-tools") ? "export const designReviewSentHistory=async()=>[]; export const sendDesignReviewGroup=async()=>({sent:[]})"
          : "export const newsletterReviewTeam=async()=>({groups:[]})" }));
      } }],
    });
    await page.route(root + "/design", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><div id="root"></div><script src="/design.js"></script>' }));
    await page.route(root + "/design.js", (route) => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.route(root + "/asset-*.png", (route) => route.fulfill({ status: 204 }));
    await page.goto(root + "/design");
    const dialog = page.getByRole("dialog", { name: "Artwork comparison" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Round 1", { exact: true }).check();
    await dialog.getByLabel("Round 2", { exact: true }).check();
    await dialog.getByRole("button", { name: "Compare selected rounds" }).click();
    await expect(dialog.getByRole("region", { name: /one shared scroll area/i }).getByRole("img")).toHaveCount(4);
    await dialog.getByRole("button", { name: "Close comparison" }).click();
    await page.getByText("Previous rounds · 1 threads", { exact: true }).click();
    await page.getByRole("button", { name: "Show me comment 1" }).click();
    await expect(page.getByText("Viewing Round 1")).toBeVisible();
    await expect(page.getByRole("img", { name: "Poster" })).toHaveAttribute("src", "/asset-1.png");
    await page.getByRole("button", { name: "Back to current artwork" }).click();
    await expect(page.getByRole("img", { name: "Poster" })).toHaveAttribute("src", "/asset-4.png");
    await page.getByRole("button", { name: "Float comments" }).click();
    await expect(page.getByRole("button", { name: "Move comments panel" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse", exact: true }).click();
    await expect(page.getByRole("button", { name: "Expand", exact: true })).toBeVisible();
    console.log("PASS: shared social and website menus, edit/suggestion flows, diffs and resolve; design comparison and history");
  } finally { await browser.close(); }
}

void main();
