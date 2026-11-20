import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import postcss from "postcss";
import { THEMES, activeThemes, ThemeScript } from "../../src/components/ui/ThemeProvider";
import { isValidThemeId } from "../../src/lib/themes/constants";

const ids = ["cubist", "infinitydots"] as const;
const css = readFileSync("src/app/artist-themes.css", "utf8");

test("inactive matrix pixels become pale on the new white panels", () => {
  assert.match(readFileSync("src/components/training-week/WorkshopRegistrationSummary.tsx", "utf8"), /fill=\{lit === "1" \? "currentColor" : "#203a2a"\}/);
  assert.match(css, /:is\(\[data-theme="cubist"\], \[data-theme="infinitydots"\]\) \.training-seat-approved circle\[fill="#203a2a"\] \{ fill: #dce6e0; \}/);
});

test("both themes use local, inert artwork while retaining opaque reading surfaces", () => {
  for (const name of ["cubist-planes", "infinity-dots"]) {
    const art = readFileSync(`public/themes/${name}.svg`, "utf8");
    assert.match(css, new RegExp(`/themes/${name}\\.svg`));
    assert.match(art, /viewBox="0 0 256/);
    assert.doesNotMatch(art, /<script|<foreignObject|<image|href=|onload=|<animate/i);
  }
  assert.match(css, /Opaque islands/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /clip-path: none/);
});

test("both original themes are permanent selectable flavours and accepted by server validation", () => {
  for (const id of ids) {
    const entry = THEMES.find((theme) => theme.id === id)!;
    assert.equal(entry.category, "flavour");
    assert.ok(activeThemes(new Date("2030-01-01")).some((theme) => theme.id === id));
    assert.equal(isValidThemeId(id), true);
    for (const path of ["src/components/ui/ThemePicker.tsx", "src/components/ui/DailyThemeCard.tsx", "src/components/themes/ThemeVotePanel.tsx"]) {
      assert.match(readFileSync(path, "utf8"), new RegExp(`${id}:\\s*\\[`));
    }
  }
});

test("saved themes survive initial paint but cannot alter public application forms", () => {
  const script = ThemeScript().props.dangerouslySetInnerHTML.__html;
  for (const id of ids) for (const path of ["/dashboard", "/apply/training-week-registration-2026-v2", "/apply/venture-connect/new"]) {
    let applied = "";
    vm.runInNewContext(script, {
      location: { pathname: path },
      document: { documentElement: { setAttribute: (_: string, value: string) => { applied = value; } } },
      localStorage: { getItem: () => id, setItem: () => assert.fail("Do not overwrite saved preference"), removeItem: () => assert.fail("Do not remove valid theme") },
      window: { matchMedia: () => ({ matches: true }) },
    });
    assert.equal(applied, path === "/dashboard" ? id : path.includes("training-week") ? "bhnsite" : "hitech");
  }
});

test("artist themes add no animation and load globally", () => {
  assert.doesNotMatch(css, /@keyframes|animation:(?! none)/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /import "\.\/artist-themes\.css"/);
});

test("restored patterns are confined to quiet accents, never tiled across working backgrounds", () => {
  const root = postcss.parse(css);
  for (const selector of ['nav[aria-label="Main navigation"]', ".dashboard-layout"]) {
    const rules: string[] = [];
    root.walkRules((rule) => {
      if (rule.selector.includes(selector)) rule.walkDecls("background-image", (decl) => { rules.push(decl.value); });
    });
    assert.ok(rules.length);
    assert.ok(rules.every((value) => value === "none"));
  }
  assert.match(css, /background-repeat: no-repeat/);
  assert.match(css, /padding-right: 96px/);
  assert.match(css, /height: 3px;\s*opacity: \.3/);
});
