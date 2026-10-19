import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import postcss from "postcss";

const source = readFileSync("src/components/dashboards/AdminDashboard.tsx", "utf8");
const css = source.match(/const AERO_CSS = `([\s\S]+)`;/)![1];

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
