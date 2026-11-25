import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { NewsletterPageReview } from "../../src/components/workspace/NewsletterPageReview";
import { NewsletterReviewOverview } from "../../src/components/workspace/NewsletterReviewOverview";

type Props = Parameters<typeof NewsletterPageReview>[0];
type FetchRequest = { url: string; init?: RequestInit };
const preview = "/api/workspace/newsletter/november/review-preview";
const launch = "/api/workspace/page-review/newsletter-november/launch";
const props: Props = {
  issueId: "november", issueTitle: "November 2026 Newsletter", issueNumber: "2026-11",
  html: "<h1>Updated November issue</h1>", initialHasSavedPreview: true,
  initialReview: { id: "newsletter-november", round: 4, status: "pending" }, canEdit: true,
  initialRounds: [
    { round: 1, savedAt: "2026-11-20T12:00:00.000Z" },
    { round: 3, savedAt: "2026-11-23T12:00:00.000Z" },
    { round: 2, savedAt: null },
    { round: 4, savedAt: null },
  ],
};

function button(document: Document, text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((element) => element.textContent === text);
  assert.ok(found, `Missing button: ${text}`);
  return found;
}

function thumbnail(document: Document): HTMLIFrameElement {
  const found = document.querySelector("iframe");
  assert.ok(found, "The saved thumbnail should be visible without another click");
  return found;
}

function historyLabels(document: Document): (string | null)[] {
  return [...document.querySelectorAll('[aria-label="Revision history"] button')].map((element) => element.textContent);
}

function parse(element: ReactElement) {
  return new JSDOM(renderToStaticMarkup(element));
}

async function mount(element: ReactElement, fetch: (request: FetchRequest) => Promise<Response> = async () => {
  throw new Error("This interaction must not issue a fetch request");
}) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test", pretendToBeVisual: true });
  const previous = Object.fromEntries(["window", "document", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const requests: FetchRequest[] = [];
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      const request = { url: String(url), init };
      requests.push(request);
      return fetch(request);
    },
  });
  const root = createRoot(dom.window.document.querySelector("#root")!);
  await act(async () => root.render(element));
  return {
    document: dom.window.document, requests,
    async click(text: string) { await act(async () => button(dom.window.document, text).click()); },
    async dispose() {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function reply(round: number, status = "pending") {
  return Response.json({ review: { id: "newsletter-november", round, status } });
}

test("overview initially identifies the issue, shows the saved thumbnail and orders earlier rounds newest first", () => {
  const dom = parse(createElement(NewsletterPageReview, props));
  try {
    const { document } = dom.window;
    assert.match(document.body.textContent!, /Issue 2026-11/);
    assert.equal(document.querySelector("h2")?.textContent, "November 2026 Newsletter");
    assert.match(document.body.textContent!, /Revision Round 4/);
    assert.deepEqual(historyLabels(document), ["Round 4 · Current", "Round 3", "Round 2", "Round 1"]);
    assert.equal(button(document, "Round 4 · Current").getAttribute("aria-pressed"), "true");
    const frame = thumbnail(document);
    assert.equal(frame.getAttribute("src"), `${preview}?round=4`);
    assert.equal(frame.title, "November 2026 Newsletter — Round 4 thumbnail");
    assert.equal(frame.getAttribute("sandbox"), "");
    assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
    assert.equal(frame.tabIndex, -1);
    assert.equal(frame.hasAttribute("srcdoc"), false);
    assert.equal(frame.parentElement?.getAttribute("aria-hidden"), "true");
    assert.ok(frame.parentElement?.classList.contains("pointer-events-none"));
    assert.equal(frame.closest("a")?.getAttribute("aria-label"), "Open November 2026 Newsletter, Round 4");
    assert.equal(frame.closest("a")?.getAttribute("target"), "_blank");
    assert.equal(frame.closest("a")?.getAttribute("rel"), "noopener noreferrer");
    assert.equal(document.querySelectorAll("iframe").length, 1);
    assert.equal(document.querySelector("textarea"), null);
  } finally { dom.window.close(); }
});

test("pending and closed previews stay authenticated and read-only; open and exported reviews retain the existing launcher", () => {
  for (const status of ["pending", "closed", "open", "exported"]) {
    const dom = parse(createElement(NewsletterPageReview, { ...props, initialReview: { ...props.initialReview!, status } }));
    try {
      const { document } = dom.window;
      const activeReview = status === "open" || status === "exported";
      const primary = document.querySelector<HTMLAnchorElement>("a.newsletter-review-launch");
      assert.ok(primary, `Saved ${status} issues need the primary full-page action`);
      assert.equal(primary.textContent, "Open full-page review");
      assert.equal(primary.getAttribute("href"), activeReview ? launch : preview);
      assert.equal(thumbnail(document).getAttribute("src"), `${preview}?round=4`);
      assert.equal(thumbnail(document).closest("a")?.getAttribute("href"), activeReview ? launch : preview);
      assert.equal(document.body.textContent!.includes("Send review request"), activeReview);
      assert.equal(document.body.textContent!.includes("Copy review link"), activeReview);
      assert.equal(document.querySelector('[href*="/api/public/"]'), null);
      if (!activeReview) assert.equal(document.querySelector('[href$="/launch"]'), null);
      if (status === "closed") assert.doesNotMatch(document.body.textContent!, /Save revision|Open team review/);
    } finally { dom.window.close(); }
  }
});

test("unsaved issues never imply a saved preview, even when an editable draft string is present", () => {
  for (const overrides of [
    { html: "", initialReview: null, initialHasSavedPreview: undefined },
    { html: "<p>Unsaved source</p>", initialReview: null, initialHasSavedPreview: false },
    { html: "<p>Unsaved source</p>", initialReview: props.initialReview, initialHasSavedPreview: false },
  ]) {
    const dom = parse(createElement(NewsletterPageReview, { ...props, initialRounds: [], ...overrides }));
    try {
      assert.match(dom.window.document.body.textContent!, /No saved preview yet/);
      assert.equal(dom.window.document.querySelector("iframe"), null);
      assert.equal(dom.window.document.querySelector("a.newsletter-review-launch"), null);
      assert.equal(dom.window.document.querySelector('[href$="/launch"]'), null);
    } finally { dom.window.close(); }
  }
  const dom = parse(createElement(NewsletterPageReview, { ...props, initialReview: null, initialRounds: [] }));
  try {
    assert.equal(thumbnail(dom.window.document).getAttribute("src"), preview);
    assert.match(dom.window.document.body.textContent!, /Ready for a first revision/);
    assert.match(dom.window.document.body.textContent!, /No earlier rounds saved yet/);
  } finally { dom.window.close(); }
});

test("an open review without saved review HTML uses the private issue preview until a revision succeeds", async () => {
  const app = await mount(createElement(NewsletterPageReview, {
    ...props, initialReview: { ...props.initialReview!, status: "open" }, initialHasReviewHtml: false,
  }), async () => reply(5, "open"));
  try {
    assert.equal(app.document.querySelector("a.newsletter-review-launch")?.getAttribute("href"), preview);
    assert.equal(thumbnail(app.document).closest("a")?.getAttribute("href"), preview);
    assert.equal(thumbnail(app.document).getAttribute("src"), preview, "A saved issue without saved review HTML cannot claim an unavailable numbered revision");
    assert.equal(app.document.querySelector('[href$="/launch"]'), null);
    await app.click("Save revision");
    assert.equal(app.document.querySelector("a.newsletter-review-launch")?.getAttribute("href"), launch);
    assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=5`);
    assert.equal(app.requests.length, 1);
  } finally { await app.dispose(); }
});

test("historical buttons show the exact read-only round without fetching or changing current review; Current restores the latest thumbnail", async () => {
  const app = await mount(createElement(NewsletterPageReview, { ...props, canEdit: false }));
  try {
    assert.doesNotMatch(app.document.body.textContent!, /Save draft|Open team review/);
    const latestFrame = thumbnail(app.document);
    for (const round of [3, 1, 2]) {
      await app.click(`Round ${round}`);
      const frame = thumbnail(app.document);
      assert.notEqual(frame, latestFrame, "Changing a round remounts its isolated thumbnail");
      assert.equal(frame.getAttribute("src"), `${preview}?round=${round}`);
      assert.equal(frame.closest("a")?.getAttribute("href"), `${preview}?round=${round}`);
      assert.equal(frame.title, `November 2026 Newsletter — Round ${round} thumbnail`);
      assert.equal(button(app.document, `Round ${round}`).getAttribute("aria-pressed"), "true");
      assert.equal(button(app.document, "Round 4 · Current").getAttribute("aria-pressed"), "false");
      const historical = [...app.document.querySelectorAll("a")].find((link) => link.textContent === "Open this round full-page");
      assert.equal(historical?.getAttribute("href"), `${preview}?round=${round}`);
      assert.match(app.document.body.textContent!, new RegExp(`Previewing Round ${round} · read-only`));
      assert.match(app.document.body.textContent!, /Revision Round 4/);
      assert.equal(app.document.querySelector("a.newsletter-review-launch")?.getAttribute("href"), preview);
    }
    await app.click("Round 4 · Current");
    assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=4`);
    assert.equal(button(app.document, "Round 4 · Current").getAttribute("aria-pressed"), "true");
    assert.doesNotMatch(app.document.body.textContent!, /Previewing Round|Open this round full-page/);
    assert.deepEqual(app.requests, [], "Preview selection is local; it does not mutate review state or send invitations");
  } finally { await app.dispose(); }
});

test("saving a revision advances its round, history and thumbnail only after the server confirms success", async () => {
  let complete: (response: Response) => void = () => { throw new Error("No save started"); };
  const app = await mount(createElement(NewsletterPageReview, { ...props, initialReview: { ...props.initialReview!, status: "open" } }), async () => new Promise<Response>((resolve) => { complete = resolve; }));
  try {
    const before = thumbnail(app.document);
    await app.click("Save revision");
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].url, "/api/workspace/newsletter/november/review");
    assert.equal(app.requests[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(app.requests[0].init!.body as string), { action: "revise", html: props.html, round: 4 });
    assert.equal(button(app.document, "Save revision").disabled, true);
    assert.equal(thumbnail(app.document), before);
    assert.deepEqual(historyLabels(app.document), ["Round 4 · Current", "Round 3", "Round 2", "Round 1"]);
    await act(async () => { complete(reply(5, "open")); });
    assert.equal(button(app.document, "Save revision").disabled, false);
    assert.match(app.document.body.textContent!, /Revision Round 5/);
    assert.deepEqual(historyLabels(app.document), ["Round 5 · Current", "Round 4", "Round 3", "Round 2", "Round 1"]);
    assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=5`);
    assert.notEqual(thumbnail(app.document), before);
    assert.equal(app.document.querySelector("a.newsletter-review-launch")?.getAttribute("href"), launch);
    await app.click("Round 4");
    assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=4`);
    assert.equal(app.requests.length, 1);
  } finally { await app.dispose(); }
});

test("saving a pending draft does not open team review, and an unchanged save does not duplicate history", async () => {
  const app = await mount(createElement(NewsletterPageReview, props), async () => reply(4));
  try {
    await app.click("Save draft");
    assert.deepEqual(JSON.parse(app.requests[0].init!.body as string), { action: "revise", html: props.html, round: 4 });
    assert.deepEqual(historyLabels(app.document), ["Round 4 · Current", "Round 3", "Round 2", "Round 1"]);
    assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=4`);
    assert.equal(app.document.querySelector("a.newsletter-review-launch")?.getAttribute("href"), preview);
    assert.doesNotMatch(app.document.body.textContent!, /Send review request|Copy review link/);
    assert.match(app.document.body.textContent!, /Draft only — team review is not open yet/);
    assert.equal(app.requests.length, 1);
  } finally { await app.dispose(); }
});

test("a first successful save enables the saved-round thumbnail and does not invent historical versions", async () => {
  const app = await mount(createElement(NewsletterPageReview, { ...props, initialReview: null, initialHasSavedPreview: false, initialRounds: [] }), async () => reply(1, "open"));
  try {
    assert.equal(app.document.querySelector("iframe"), null);
    await app.click("Start review");
    assert.deepEqual(JSON.parse(app.requests[0].init!.body as string), { action: "open", html: props.html });
    assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=1`);
    assert.deepEqual(historyLabels(app.document), ["Round 1 · Current"]);
    assert.match(app.document.body.textContent!, /No earlier rounds saved yet/);
    assert.equal(app.document.querySelector("a.newsletter-review-launch")?.getAttribute("href"), launch);
  } finally { await app.dispose(); }
});

test("failed saves announce the error and retain the previous round, historical selection and saved thumbnail", async () => {
  for (const mode of ["conflict", "network", "missing review"]) {
    const app = await mount(createElement(NewsletterPageReview, props), async () => {
      if (mode === "network") throw new Error("Connection lost");
      if (mode === "missing review") return Response.json({ ok: true });
      return Response.json({ error: "This issue changed. Reload before saving." }, { status: 409 });
    });
    try {
      await app.click("Round 2");
      const before = thumbnail(app.document);
      await app.click("Save draft");
      assert.equal(app.document.querySelector('[role="alert"]')?.textContent, mode === "network" ? "Connection lost" : mode === "missing review" ? "Could not save the review." : "This issue changed. Reload before saving.");
      assert.equal(button(app.document, "Save draft").disabled, false);
      assert.equal(thumbnail(app.document), before);
      assert.equal(thumbnail(app.document).getAttribute("src"), `${preview}?round=2`);
      assert.deepEqual(historyLabels(app.document), ["Round 4 · Current", "Round 3", "Round 2", "Round 1"]);
      assert.match(app.document.body.textContent!, /Revision Round 4/);
      assert.match(app.document.body.textContent!, /Draft only — team review is not open yet/);
      assert.equal(app.requests.length, 1);
    } finally { await app.dispose(); }
  }
});

test("a save refreshes actual server history only when another editor advanced the returned round", () => {
  // JSDOM deliberately does not navigate or reload. Exercise the exact guard
  // from the component instead, alongside the real mounted save tests above.
  const source = readFileSync("src/components/workspace/NewsletterPageReview.tsx", "utf8");
  const parsed = ts.createSourceFile("NewsletterPageReview.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const guards: ts.IfStatement[] = [];
  function collect(node: ts.Node) {
    if (ts.isIfStatement(node) && node.thenStatement.getText(parsed).includes("window.location.reload()")) guards.push(node);
    ts.forEachChild(node, collect);
  }
  collect(parsed);
  assert.equal(guards.length, 1);
  const condition = guards[0].expression.getText(parsed);
  const shouldReload = new Function("review", "result", `return Boolean(${condition});`) as (review: { round: number } | null, result: { unchanged?: boolean; review: { round: number } }) => boolean;
  for (const [review, result, expected] of [
    [null, { review: { round: 1 } }, false],
    [{ round: 4 }, { review: { round: 4 } }, false],
    [{ round: 4 }, { unchanged: true, review: { round: 4 } }, false],
    [{ round: 4 }, { review: { round: 5 } }, false],
    [{ round: 4 }, { unchanged: true, review: { round: 5 } }, true],
    [{ round: 4 }, { unchanged: true, review: { round: 7 } }, true],
    [{ round: 4 }, { review: { round: 6 } }, true],
  ] as const) assert.equal(shouldReload(review, result), expected);
  assert.ok(source.indexOf("if (!response.ok || !result.review)") < guards[0].pos, "Failed saves never trigger navigation");
  assert.ok(source.indexOf("setReview(result.review)") < guards[0].pos, "A confirmed save updates the visible state before refreshing");
});

test("overview encodes issue identifiers and labels available issue choices", () => {
  const dom = parse(createElement(NewsletterReviewOverview, {
    issueId: "november/special", issueTitle: "November Special Edition", issueNumber: "2026-11",
    currentRound: 4, status: "pending", hasPreview: true, launch: null, rounds: [],
    issues: [{ id: "november/special", title: "November Special Edition", dateline: "November 2026" }, { id: "october", title: "October Newsletter", dateline: "October 2026" }],
  }));
  try {
    assert.equal(thumbnail(dom.window.document).getAttribute("src"), "/api/workspace/newsletter/november%2Fspecial/review-preview?round=4");
    const select = dom.window.document.querySelector("select");
    assert.equal(select?.closest("label")?.firstChild?.textContent, "Switch issue");
    assert.equal(select?.name, "issue");
    assert.equal(select?.form?.getAttribute("method"), "get");
    assert.equal(select?.form?.getAttribute("action"), "/admin/workspace/marketing/newsletter/review");
    assert.equal(select?.value, "november/special");
    assert.deepEqual([...select!.options].map((option) => option.textContent), ["November Special Edition", "October Newsletter"]);
  } finally { dom.window.close(); }
});
