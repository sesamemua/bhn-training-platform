import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import postcss from "postcss";

const source = readFileSync("src/components/dashboards/AdminDashboard.tsx", "utf8");
const css = source.match(/const AERO_CSS = `([\s\S]+)`;/)![1];

test("the obsolete bottom overview and its private queries are removed, not just hidden", () => {
  assert.doesNotMatch(source, /Triage queue|Today&apos;s pulse|Pipeline at a glance|sr-layout|sr-rail/);
  assert.doesNotMatch(source, /prisma\.certificate\.count|prisma\.auditLog\.findMany|new24hEnrollments|phantomCount/);
  assert.match(source, /<AdminDashboardCards/);
  assert.match(source, /\{pageUsage\}/);
});

test("the shared glaze has no diagonal white beam or hard white highlight", () => {
  const parsed = postcss.parse(css);
  const material = parsed.nodes.find((node) => node.type === "rule" && node.selector === ".adash-aero")!;
  assert.match(material.toString(), /linear-gradient\(180deg/);
  assert.doesNotMatch(material.toString(), /112deg|\bwhite\b|#[a-f0-9]{3,8}/i);
  assert.doesNotMatch(css, /rgb\(255 255 255 \/ 20%\)/);
});

test("porcelain finish stays dashboard-scoped, theme-aware and free of moving or blurred overlays", () => {
  const parsed = postcss.parse(css);
  const material = parsed.nodes.find((node) => node.type === "rule" && node.selector === ".adash-aero")!;
  assert.match(material.toString(), /--porcelain-glaze/);
  assert.match(material.toString(), /var\(--card-solid\)/);
  assert.match(material.toString(), /--porcelain-shadow/);
  for (const selector of [".adash-aero .aero-frame", ".adash-aero .aero-card"]) {
    const rule = parsed.nodes.find((node) => node.type === "rule" && node.selector === selector)!;
    assert.match(rule.toString(), /background-image: var\(--porcelain-glaze\)/);
    assert.match(rule.toString(), /box-shadow: var\(--porcelain-shadow\)/);
    assert.doesNotMatch(rule.toString(), /backdrop-filter|animation|filter:/);
  }
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.adash-aero \.aero-frame > \.aero-card \{\s*background: transparent;/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /background: Canvas;/);
});

test("Daydream alone adds a high-gloss glaze to shared cards and the dashboard", () => {
  const global = postcss.parse(readFileSync("src/app/globals.css", "utf8"));
  const glossyRules: string[] = [];
  global.walkRules((rule) => {
    rule.walkDecls((decl) => {
      if (decl.prop === "--daydream-glaze" || decl.value.includes("var(--daydream-glaze)")) glossyRules.push(rule.selector);
    });
  });
  assert.ok(glossyRules.length >= 3);
  assert.ok(glossyRules.every((selector) => selector.startsWith('[data-theme="light"]')));
  assert.ok(glossyRules.some((selector) => selector.includes(".adash-aero")));
  assert.ok(glossyRules.some((selector) => selector.includes(".surface")));
  const glaze = global.nodes.filter((node) => node.type === "rule" && node.selector === '[data-theme="light"]').at(-1)!;
  assert.match(glaze.toString(), /linear-gradient\(112deg/);
  assert.match(glaze.toString(), /inset 0 2px 1px #ffffff/);
  assert.doesNotMatch(glaze.toString(), /animation|filter:|url\(/);
});
