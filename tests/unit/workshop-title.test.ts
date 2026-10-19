import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import postcss from "postcss";

test("workshop titles keep neon colors with a single tight glow, including on hover", () => {
  const css = postcss.parse(readFileSync("src/app/globals.css", "utf8"));
  const shadows: string[] = [];
  css.walkRules((rule) => {
    if (rule.selector === ".training-workshop-title" || rule.selector === ".training-workshop-title:is(:hover, :focus-visible)") {
      rule.walkDecls("text-shadow", (decl) => { shadows.push(decl.value); });
      rule.walkDecls("animation", () => { assert.fail("Titles must stay steady"); });
    }
  });
  assert.deepEqual(shadows, [
    "0 0 2px color-mix(in srgb, var(--workshop-accent) 30%, transparent)",
    "0 0 3px color-mix(in srgb, var(--workshop-accent) 40%, transparent)",
  ]);
});
