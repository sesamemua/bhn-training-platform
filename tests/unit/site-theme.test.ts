import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import {
  FORCED_THEME_SCRIPT, forcedThemeFor, PUBLIC_FORM_THEME, SITE_THEME, SITE_THEMED_FORM_SLUGS,
} from "../../src/lib/formbuilder/site-theme";
import { FORCED_PUBLIC_THEME, isForcedThemeRoute, THEMES, ThemeScript } from "../../src/components/ui/ThemeProvider";
import { VALID_THEME_IDS } from "../../src/lib/themes/constants";
import { parseForm } from "../../src/lib/formbuilder/types";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const V1 = "/apply/training-week-registration-2026";
const V2 = "/apply/training-week-registration-2026-v2";
const INSIGHTS = "/apply/industry-insights-2026";

/* ───── The lookup ───── */

const PATHS: [string, string | null][] = [
  [V2, "bhnsite"],
  [`${V2}/`, "bhnsite"],
  [`${V2}?utm_source=luma`, "bhnsite"],
  [`${V2}#sessions`, "bhnsite"],
  [V1, "hitech"],
  [`${V1}/`, "hitech"],
  [INSIGHTS, "hitech"],
  ["/apply/", "hitech"],
  // Starting with v2's slug is not being v2.
  [`${V2}-draft`, "hitech"],
  ["/apply", null],
  ["/", null],
  ["/dashboard", null],
  ["/applying/x", null],
  [`/events/x${V2}`, null],
];

test("v2 is pinned to the site skin; every other public form stays Voltage; the rest follow the visitor", () => {
  for (const [path, want] of PATHS) assert.equal(forcedThemeFor(path), want, path);
  assert.equal(SITE_THEME, "bhnsite");
  assert.equal(FORCED_PUBLIC_THEME, PUBLIC_FORM_THEME);
});

test("the pre-paint copy of the lookup agrees with the TypeScript one on every path", () => {
  const inScript = vm.runInNewContext(`(${FORCED_THEME_SCRIPT})`) as (p: string) => string | null;
  for (const [path] of PATHS) assert.equal(inScript(path), forcedThemeFor(path), path);
});

test("isForcedThemeRoute still covers every /apply/ page, v2 included", () => {
  assert.equal(isForcedThemeRoute(V1), true);
  assert.equal(isForcedThemeRoute(V2), true);
  assert.equal(isForcedThemeRoute("/dashboard"), false);
});

test("v1, as it is live, is not on the list and has no presentation", () => {
  const v1 = JSON.parse(read("tests/unit/fixtures/training-week-v1-live.json")) as { slug: string; fields: unknown };
  assert.equal((SITE_THEMED_FORM_SLUGS as readonly string[]).includes(v1.slug), false);
  assert.equal(forcedThemeFor(`/apply/${v1.slug}`), "hitech");
  assert.equal(parseForm(v1.fields).presentation, undefined);
});

test("bhnsite is nobody's to pick", () => {
  assert.equal(THEMES.some((t) => (t.id as string) === SITE_THEME), false);
  assert.equal((VALID_THEME_IDS as readonly string[]).includes(SITE_THEME), false);
});

/* ───── The script itself, run as a browser would run it ───── */

function runThemeScript(pathname: string, opts: { saved?: string; dark?: boolean } = {}) {
  const code = (ThemeScript() as { props: { dangerouslySetInnerHTML: { __html: string } } })
    .props.dangerouslySetInnerHTML.__html;
  const attrs: Record<string, string> = {};
  const store = new Map<string, string>(opts.saved ? [["bhn-theme", opts.saved]] : []);
  vm.runInNewContext(code, {
    location: { pathname },
    document: { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    window: { matchMedia: () => ({ matches: Boolean(opts.dark) }) },
  });
  return { theme: attrs["data-theme"], saved: store.get("bhn-theme") };
}

test("pre-paint: v2 is the site skin whatever the OS or a saved theme says, and the saved theme is left alone", () => {
  assert.equal(runThemeScript(V2).theme, "bhnsite");
  assert.equal(runThemeScript(`${V2}/`).theme, "bhnsite");
  const r = runThemeScript(V2, { dark: true, saved: "rosalind" });
  assert.deepEqual(r, { theme: "bhnsite", saved: "rosalind" });
});

test("pre-paint: v1 and every other form stay Voltage, light OS or not", () => {
  assert.deepEqual(runThemeScript(V1, { saved: "rosalind" }), { theme: "hitech", saved: "rosalind" });
  assert.equal(runThemeScript(V1, { dark: false }).theme, "hitech");
  assert.equal(runThemeScript(INSIGHTS).theme, "hitech");
});

test("pre-paint: a dashboard page still follows the saved theme, then the OS", () => {
  assert.equal(runThemeScript("/dashboard", { saved: "rosalind" }).theme, "rosalind");
  assert.equal(runThemeScript("/dashboard", { dark: true }).theme, "hitech");
  assert.equal(runThemeScript("/dashboard", { dark: false }).theme, "light");
  // The retired "dark" id still migrates.
  assert.deepEqual(runThemeScript("/dashboard", { saved: "dark" }), { theme: "hitech", saved: "hitech" });
  // bhnsite is not an allowed id: saved by hand, it is dropped like any unknown one.
  assert.deepEqual(runThemeScript("/dashboard", { saved: "bhnsite" }), { theme: "light", saved: undefined });
});

/* ───── The stylesheet ───── */

const CSS = read("src/app/apply/[slug]/site-theme.css");

/** Style-rule selectors, recursing into @media / @supports. */
function selectorsOf(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const prelude = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
    }
    const body = src.slice(open + 1, j - 1);
    if (/^@(media|supports)\b/.test(prelude)) out.push(...selectorsOf(body));
    else if (!prelude.startsWith("@")) out.push(prelude);
    i = j;
  }
  return out;
}

/** Split a selector list on its top-level commas — not the ones inside :is(). */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const SELECTORS = selectorsOf(CSS).flatMap(splitList);

test("the stylesheet parses into rules", () => {
  // A guard on the guard: a parser that found nothing would pass everything below.
  assert.ok(SELECTORS.length > 40, `only ${SELECTORS.length} selectors found`);
});

test("every rule in site-theme.css is scoped to the skin, so no other page can match it", () => {
  const scoped = /\.bhn-site(?![\w-])|\[data-theme="bhnsite"\]/;
  for (const sel of SELECTORS) assert.match(sel, scoped, sel);
});

test("the stylesheet stays unlayered and is not a second Tailwind entry point", () => {
  // Comments may talk about layers; only the code is checked.
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  // Layered, its rules would lose to the utilities they exist to override.
  assert.doesNotMatch(code, /@layer\b/);
  assert.doesNotMatch(code, /@import\b|@tailwind\b|@apply\b|@theme\b/);
});

test("every class the skin targets still exists in the components it skins", () => {
  const source = [
    "src/components/workspace/FormFillView.tsx",
    "src/components/workspace/SessionCalendar.tsx",
    "src/components/workspace/WeekGrid.tsx",
    "src/components/forms/RichText.tsx",
    "src/app/apply/[slug]/page.tsx",
  ].map(read).join("\n");
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

  const attrValues = new Set<string>();
  const classes = new Set<string>();
  for (const sel of SELECTORS) {
    const bare = sel.replace(/\[([\w-]+)([*^$|~]?)=\s*"([^"]*)"\]/g, (_, name: string, op: string, value: string) => {
      if (name === "class" && op === "*") attrValues.add(value);
      return "";
    });
    for (const m of bare.matchAll(/\.((?:\\.|[\w-])+)/g)) classes.add(m[1].replace(/\\(.)/g, "$1"));
  }
  assert.ok(classes.size > 20);

  for (const cls of classes) {
    // A class token: bounded by whitespace, a quote or a backtick.
    const token = new RegExp(`(^|[\\s"'\`{])${esc(cls)}(?=$|[\\s"'\`}])`, "m");
    assert.match(source, token, `.${cls} is styled but no longer used`);
  }
  for (const v of attrValues) assert.ok(source.includes(v), `[class*="${v}"] no longer matches anything`);
});
