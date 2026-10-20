import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import postcss from "postcss";
import { THEMES, activeThemes, ThemeScript } from "../../src/components/ui/ThemeProvider";
import { isValidThemeId } from "../../src/lib/themes/constants";

const ids = ["cubist", "infinitydots"] as const;
const css = readFileSync("src/app/artist-themes.css", "utf8");

test("art themes show the real approved count as text instead of industrial LED pixels", () => {
  assert.match(readFileSync("src/components/training-week/WorkshopRegistrationSummary.tsx", "utf8"), /<span className="sr-only">\{value\}<\/span>/);
  assert.match(css, /\.training-seat-approved svg \{ display: none;/);
  assert.match(css, /\.training-seat-approved \.sr-only \{\s*position: static;/);
});

test("previous artwork stays inert but is no longer repeated behind the interface", () => {
  for (const name of ["cubist-planes", "infinity-dots"]) {
    const art = readFileSync(`public/themes/${name}.svg`, "utf8");
    assert.match(art, /viewBox="0 0 256/);
    assert.doesNotMatch(art, /<script|<foreignObject|<image|href=|onload=|<animate/i);
  }
  assert.doesNotMatch(css, /url\(|--theme-art/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /clip-path: none/);
});

test("the component languages cover surfaces, commands, typography, navigation and live statistics", () => {
  const dashboard = readFileSync("src/components/dashboards/AdminDashboard.tsx", "utf8");
  assert.equal((dashboard.match(/className="theme-stat-value"/g) ?? []).length, 4);
  assert.equal((dashboard.match(/className="theme-stat-label"/g) ?? []).length, 4);
  for (const selector of [".surface", "section.bg-card", "button, a", ".toc-cta", ".training-seat-well", ".training-workshop-title", ".theme-stat-value", "[data-sidebar-nav-href]", "header.full-bleed"]) assert.ok(css.includes(selector), selector);
  assert.match(css, /\.pill \{ border-radius: 0; box-shadow:/);
  assert.match(css, /\.pill \{ width: 68px; min-height: 68px; border-radius: 50%;/);
  assert.match(css, /\.aero-frame > \.aero-card \{\s*background: transparent;\s*border: 0;\s*box-shadow: none;/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:active/);
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

test("primary text, muted labels and commands meet AA contrast on the new surfaces", () => {
  const parsed = postcss.parse(css);
  for (const id of ids) {
    const tokens: Record<string, string> = {};
    parsed.walkRules((rule) => {
      if (rule.selectors.includes(`[data-theme="${id}"]`)) rule.walkDecls((decl) => { if (decl.prop.startsWith("--")) tokens[decl.prop] = decl.value; });
    });
    const luminance = (hex: string) => hex.slice(1).match(/../g)!.map((n) => parseInt(n, 16) / 255).reduce((sum, c, i) => sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0);
    for (const [fg, bg] of [[tokens["--fg"], tokens["--card-solid"]], [tokens["--fg-muted"], tokens["--elevated"]], [tokens["--fg-subtle"], tokens["--raised"]], ["#ffffff", tokens["--brand-600"]], ["#006b3c", "#ffffff"], ["#923318", "#ffffff"]]) {
      const a = luminance(fg), b = luminance(bg);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${id}: ${fg} on ${bg}`);
    }
  }
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.doesNotMatch(css, /@keyframes|animation:(?! none)/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /import "\.\/artist-themes\.css"/);
});
