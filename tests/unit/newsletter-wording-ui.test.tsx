import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { NewsletterClient } from "../../src/components/workspace/NewsletterClient";
import { SECTIONS, SECTION_THEME } from "../../src/lib/newsletter/types";

type Issue = Parameters<typeof NewsletterClient>[0]["initialIssue"];
type Element = ReactElement<Record<string, unknown>>;
type Reply = { ok: boolean; json: () => Promise<unknown> };
type Fetch = (url: string, init: { body: string }) => Promise<Reply>;

const initialIssue: Issue = {
  id: "november", title: "November 2026 Newsletter", dateline: "November 2026", status: "generated",
  renderedHtml: "<h1>Saved newsletter</h1>", renderedAt: "2026-11-25T12:00:00.000Z",
  pieces: [{ id: "piece-1", section: "engage", position: 0, rawBody: "Original contributor wording.", sourceUrl: null, authorName: "Contributor", status: "normalised" }],
};

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function button(tree: unknown, label: string): Element {
  const found = elements(tree).find((node) => node.type === "button" && renderToStaticMarkup(node).includes(label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

function checkbox(tree: unknown, section = "engage"): Element {
  const found = elements(tree).find((node) => node.type === "input" && node.props.type === "checkbox"
    && node.props["aria-label"] === `Keep wording as-is for ${SECTION_THEME[section as keyof typeof SECTION_THEME].label}`);
  assert.ok(found, `Missing section checkbox: ${section}`);
  return found;
}

const source = ts.transpileModule(readFileSync("src/components/workspace/NewsletterClient.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount(fetch: Fetch, overrides: Partial<Issue> = {}) {
  const require = createRequire(import.meta.url);
  const exports: { NewsletterClient?: typeof NewsletterClient } = {};
  const state: unknown[] = [];
  const copied: string[] = [];
  let index = 0;
  const mocks: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => {
        const current = index++;
        if (!(current in state)) state[current] = initial;
        return [state[current], (next: unknown) => {
          state[current] = typeof next === "function" ? (next as (value: unknown) => unknown)(state[current]) : next;
        }];
      },
    },
    "@/lib/newsletter/types": { SECTIONS, SECTION_THEME },
    "./NewsletterImages": { NewsletterImages: () => null },
    "./NewsletterExperiments": { NewsletterExperiments: () => null },
  };
  new Function("require", "exports", "fetch", "navigator", "window", source)(
    (id: string) => mocks[id] ?? require(id), exports, fetch,
    { clipboard: { writeText: async (text: string) => { copied.push(text); } } },
    { setTimeout: () => 0 },
  );
  return {
    copied,
    render() {
      index = 0;
      return exports.NewsletterClient!({ initialIssue: { ...initialIssue, ...overrides }, canEdit: true });
    },
  };
}

test("editors get a labelled, saved-value wording checkbox for each section; contributors do not", () => {
  const tree = createElement(NewsletterClient, { initialIssue: { ...initialIssue, preserveWording: { engage: true } }, canEdit: true });
  const html = renderToStaticMarkup(tree);
  const checkboxes = [...html.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].map(([input]) => input);
  assert.equal(checkboxes.length, 5);
  for (const section of SECTIONS) {
    const input = checkboxes.find((markup) => markup.includes(`Keep wording as-is for ${SECTION_THEME[section].label}`));
    assert.ok(input);
    assert.equal(input.includes('checked=""'), section === "engage");
    assert.match(input, new RegExp(`aria-describedby="wording-help-november-${section}"`));
    assert.ok(html.includes(`id="wording-help-november-${section}"`));
  }
  assert.equal((html.match(/Saved text in this section is used exactly as submitted; AI will not rewrite it\./g) ?? []).length, 5);
  const readonly = renderToStaticMarkup(createElement(NewsletterClient, { initialIssue, canEdit: false }));
  assert.doesNotMatch(readonly, /Keep wording as-is/);
  const sent = renderToStaticMarkup(createElement(NewsletterClient, { initialIssue: { ...initialIssue, status: "sent" }, canEdit: true }));
  assert.equal([...sent.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].filter(([input]) => input.includes('disabled=""')).length, 5);
});

test("wording settings save per section without optimism and invalidate the saved preview", async () => {
  let complete: (reply: Reply) => void = () => { throw new Error("Request not started"); };
  const requests: unknown[] = [];
  const app = mount(async (url, init) => {
    assert.equal(url, "/api/workspace/newsletter/november");
    requests.push(JSON.parse(init.body));
    return new Promise<Reply>((resolve) => { complete = resolve; });
  });
  const change = checkbox(app.render()).props.onChange as (event: { currentTarget: { checked: boolean } }) => Promise<unknown>;
  const saving = change({ currentTarget: { checked: true } });
  assert.deepEqual(requests, [{ action: "setPreserveWording", section: "engage", preserveWording: true }]);
  const pending = app.render();
  assert.equal(checkbox(pending).props.checked, false);
  assert.equal(elements(pending).filter((node) => node.type === "input" && node.props.type === "checkbox" && node.props.disabled).length, 5);
  assert.match(renderToStaticMarkup(pending), /Saving…/);
  complete({ ok: true, json: async () => ({ ok: true, issue: { ...initialIssue, renderedAt: null, preserveWording: { engage: true } } }) });
  await saving;
  const saved = app.render();
  assert.equal(checkbox(saved).props.checked, true);
  assert.equal(checkbox(saved).props.disabled, false);
  assert.equal(checkbox(saved, "equip").props.checked, false);
  assert.match(renderToStaticMarkup(saved), /Saved preview — needs a new layout/);
  assert.equal(button(saved, "Copy HTML").props.disabled, true);
  await (button(saved, "Copy HTML").props.onClick as () => Promise<void>)();
  assert.deepEqual(app.copied, []);
});

test("network and server failures leave wording settings unchanged and announce an error", async () => {
  for (const networkFailure of [true, false]) {
    const app = mount(async () => {
      if (networkFailure) throw new Error("offline");
      return { ok: false, json: async () => ({ ok: false, error: "The issue has already been sent." }) };
    }, { preserveWording: { engage: true } });
    await (checkbox(app.render()).props.onChange as (event: { currentTarget: { checked: boolean } }) => Promise<unknown>)({ currentTarget: { checked: false } });
    const tree = app.render();
    assert.equal(checkbox(tree).props.checked, true);
    assert.equal(checkbox(tree).props.disabled, false);
    const error = elements(tree).find((node) => node.props.role === "alert");
    assert.ok(error);
    assert.match(renderToStaticMarkup(error), networkFailure ? /Could not confirm the change/ : /already been sent/);
  }
});

test("sent settings cannot start a request even if the change handler is invoked", async () => {
  let requests = 0;
  const app = mount(async () => { requests++; throw new Error("Must not call"); }, { status: "sent" });
  await (checkbox(app.render()).props.onChange as (event: { currentTarget: { checked: boolean } }) => Promise<unknown>)({ currentTarget: { checked: true } });
  assert.equal(requests, 0);
});

test("unlaid-out content disables Copy HTML and labels the old preview; excluded pieces do not", async () => {
  for (const status of ["submitted", "normalised", "excluded"]) {
    const app = mount(async () => { throw new Error("Not used"); }, { pieces: initialIssue.pieces.map((piece) => ({ ...piece, status })) });
    const tree = app.render();
    const stale = status === "submitted";
    assert.equal(button(tree, "Copy HTML").props.disabled, stale);
    assert.equal(renderToStaticMarkup(tree).includes("Saved preview — needs a new layout"), stale);
    await (button(tree, "Copy HTML").props.onClick as () => Promise<void>)();
    assert.deepEqual(app.copied, stale ? [] : [initialIssue.renderedHtml]);
  }
});

test("protected raw pieces do not make a freshly generated layout stale", async () => {
  const app = mount(async () => { throw new Error("Not used"); }, {
    preserveWording: { engage: true },
    pieces: initialIssue.pieces.map((piece) => ({ ...piece, status: "submitted" })),
  });
  const tree = app.render();
  assert.equal(button(tree, "Copy HTML").props.disabled, false);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Saved preview — needs a new layout/);
  await (button(tree, "Copy HTML").props.onClick as () => Promise<void>)();
  assert.deepEqual(app.copied, [initialIssue.renderedHtml]);
});

test("Own AI results report the number of protected pieces whose submitted wording was kept", async () => {
  const app = mount(async (_url, init) => {
    assert.equal(JSON.parse(init.body).action, "aiApply");
    return { ok: true, json: async () => ({ ok: true, issue: { ...initialIssue, renderedAt: null }, report: {
      applied: [], missing: [], unknown: [], problems: [],
      preserved: [{ id: "piece-1", section: "engage" }, { id: "piece-2", section: "equip" }],
    } }) };
  });
  (button(app.render(), "Own AI").props.onClick as () => void)();
  const textarea = elements(app.render()).find((node) => node.type === "textarea" && node.props.placeholder === "Paste the whole reply");
  assert.ok(textarea);
  (textarea.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '{"pieces":[]}' } });
  await (button(app.render(), "3 · Apply").props.onClick as () => Promise<void>)();
  assert.match(renderToStaticMarkup(app.render()), /Kept submitted wording for 2 protected pieces\./);
});
