import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";

/**
 * Staff dashboard: the last-opened page leads the shortcuts, Edit lets tiles be
 * dragged into any order (saved as `order`), and Most-used pages shows your
 * figures beside the team's totals. Server action and database are mocked.
 */
const origin = "https://dashboard-shortcuts.test";

async function main() {
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({
    stdin: {
      contents: `import React from "react"; import {createRoot} from "react-dom/client";
        import {ShortcutsEditor} from "./src/components/dashboards/ShortcutsEditor";
        import {PageUsagePanel} from "./src/components/dashboards/PageUsageCard";
        import {summarizePageUsage} from "./src/lib/page-usage";
        const row = (path, visits, min, people) => ({ path, visits, ms: min * 60000, last: new Date(2026, 10, visits), people });
        const mine = summarizePageUsage([row("/admin/workspace/marketing/social", 40, 95), row("/review/symposium-2026/report", 22, 180), row("/admin/workspace/design-review", 9, 30)]);
        const team = summarizePageUsage([row("/review/symposium-2026/report", 120, 900, 6), row("/admin/workspace/marketing/social", 80, 400, 4), row("/admin/workspace/training-admin", 31, 75, 2)]);
        const c = (path, visits) => ({ path, label: path.slice(1).toUpperCase(), visits });
        createRoot(document.getElementById("root")).render(<div style={{maxWidth: 1180, margin: "24px auto", display: "grid", gap: 24}}>
          <ShortcutsEditor candidates={[c("/a", 30), c("/b", 20), c("/c", 10), c("/d", 9)]} initialPrefs={{pinned: [], hidden: []}}
            lastOpened={{path: "/review/symposium-2026/report", label: "Event Report"}} />
          <PageUsagePanel mine={mine} team={{usage: team, people: 6}} />
        </div>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic", outfile: "/private/tmp/dashboard-shortcuts/app.js",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "server-mocks", setup(builder) {
      builder.onResolve({ filter: /shortcut-actions$|^@\/lib\/prisma$|^@prisma\/client$|^next\/link$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "tsx", resolveDir: process.cwd(), contents: path.endsWith("shortcut-actions")
        ? "export async function saveShortcuts(prefs) { (window.saves ||= []).push(prefs); return { ok: true }; }"
        : path === "next/link" ? "export default function Link({ href, ...props }) { return <a href={href} {...props} />; }"
        : path === "@prisma/client" ? "export const Prisma = { join() {} };" : "export const prisma = {};" }));
    } }],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(origin + "/**", (route) => new URL(route.request().url()).pathname === "/app.js"
      ? route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text })
      : route.fulfill({ contentType: "text/html", body: `<html><head><style>${css.css}body{margin:0}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>` }));
    await page.goto(origin);

    const nav = page.getByRole("navigation", { name: "Your shortcuts" });
    const first = nav.getByRole("link").first();
    await expect(first).toContainText("Event Report");
    await expect(first).toContainText("Last opened");
    await expect(first).toHaveAttribute("href", "/review/symposium-2026/report");

    await nav.getByRole("button", { name: "Edit" }).click();
    await expect(nav).toContainText("Drag tiles to rearrange them.");
    const order = () => nav.locator("[data-shortcut]").evaluateAll((els) => els.map((el) => el.getAttribute("data-shortcut")));
    assert.deepEqual(await order(), ["/a", "/b", "/c", "/d"]);
    await nav.locator('[data-shortcut="/c"]').dragTo(nav.locator('[data-shortcut="/a"]'));
    await expect.poll(order).toEqual(["/c", "/a", "/b", "/d"]);
    await nav.locator('[data-shortcut="/a"]').dragTo(nav.locator('[data-shortcut="/d"]'));
    await expect.poll(order).toEqual(["/c", "/b", "/d", "/a"]);
    const saves = await page.evaluate(() => (window as unknown as { saves: { order?: string[] }[] }).saves);
    assert.deepEqual(saves.at(-1)!.order, ["/c", "/b", "/d", "/a"], "the arrangement is saved for next time");
    await nav.getByRole("button", { name: "Done" }).click();
    await expect(nav.getByRole("link").first()).toContainText("Last opened");
    await expect(nav.getByRole("link").nth(1)).toHaveAttribute("href", "/c");

    const panel = page.getByRole("region", { name: "Most-used pages" });
    await expect(panel.getByRole("group", { name: "You" })).toContainText("Social");
    const team = panel.getByRole("group", { name: "Whole team" });
    await expect(team).toContainText("Active people");
    await expect(team).toContainText("6 people");
    await expect(team.locator("dd").nth(2)).toHaveText("6");
    // No box with a coloured accent down its left side.
    const leftAccents = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el);
      return parseFloat(s.borderLeftWidth) > 1 && s.borderLeftColor !== s.borderRightColor;
    }).length);
    assert.equal(leftAccents, 0);
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/dashboard.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS: last-opened first, drag to arrange (saved order), Most-used pages for you and the team, no left accent boxes; mocked data only");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
