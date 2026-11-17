import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { NewsletterClient } from "../../src/components/workspace/NewsletterClient";
import { NewsletterImages } from "../../src/components/workspace/NewsletterImages";
import { IMAGE_TYPES, MAX_ASSET_BYTES } from "../../src/lib/assets/core";

const image = { id: "picture-1", assetId: "asset-1", url: "https://example.com/graphic.png", alt: "Event dates and registration" };
const props = { issueId: "november", targetType: "piece" as const, targetId: "piece-1", label: "EVENTS item 1", images: [image], onChange: () => {} };

test("picture controls allow multiple files, show uncropped thumbnails and label every action", () => {
  const html = renderToStaticMarkup(createElement(NewsletterImages, props));
  assert.match(html, /type="file" multiple=""/);
  assert.match(html, /Upload pictures for EVENTS item 1/);
  assert.match(html, /image\/png,image\/jpeg,image\/webp,image\/gif/);
  assert.match(html, /alt="Event dates and registration"/);
  assert.match(html, /object-contain/);
  assert.match(html, /Edit alt text for picture 1 in EVENTS item 1/);
  assert.match(html, /Remove picture 1 from EVENTS item 1/);
  assert.match(html, /aria-live="polite"/);
  const readonly = renderToStaticMarkup(createElement(NewsletterImages, { ...props, disabled: true }));
  assert.match(readonly, /graphic.png/);
  assert.doesNotMatch(readonly, /type="file"|<button/);
});

test("contributors get pictures for all five sections and every item, including a persistent stale preview notice", () => {
  const initialIssue = {
    id: "november", title: "November 2026 Newsletter", dateline: "November 2026", status: "generated",
    renderedHtml: "<h1>Saved review</h1>", renderedAt: null,
    pieces: [{ id: "piece-1", section: "event", position: 0, rawBody: "Event details", sourceUrl: null, authorName: "Contributor", status: "normalised" }],
    sectionImages: { top: [image] }, imagesByPieceId: { "piece-1": [image] },
  };
  const html = renderToStaticMarkup(createElement(NewsletterClient, { initialIssue, canEdit: false }));
  assert.equal((html.match(/type="file"/g) ?? []).length, 6);
  assert.equal((html.match(/object-contain/g) ?? []).length, 2);
  assert.match(html, /Pictures are public links/);
  assert.match(html, /Needs a new layout/);
  assert.match(html, /Saved review/);
  const sent = renderToStaticMarkup(createElement(NewsletterClient, { initialIssue: { ...initialIssue, status: "sent" }, canEdit: false }));
  assert.doesNotMatch(sent, /type="file"/);
  const editor = renderToStaticMarkup(createElement(NewsletterClient, { initialIssue, canEdit: true }));
  const copyButton = [...editor.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2].includes("Copy HTML"));
  assert.match(copyButton![1], /\sdisabled(?:=|\s|$)/);
});

test("an issue containing only section pictures can be laid out", () => {
  const initialIssue = { id: "november", title: "November Newsletter", dateline: "November 2026", status: "draft",
    renderedHtml: null, renderedAt: null, pieces: [], sectionImages: { top: [image] } };
  for (const hasPictures of [true, false]) {
    const html = renderToStaticMarkup(createElement(NewsletterClient, {
      initialIssue: { ...initialIssue, sectionImages: hasPictures ? { top: [image] } : {} }, canEdit: true,
    }));
    const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2].includes("Lay out with AI"));
    assert.equal(/\sdisabled(?:=|\s|$)/.test(button![1]), !hasPictures);
  }
});

function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props?.children)];
}

test("multi-selection uploads separately and keeps successes when one picture or connection fails", async () => {
  const source = ts.transpileModule(readFileSync("src/components/workspace/NewsletterImages.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = createRequire(import.meta.url);
  const exports: { NewsletterImages?: typeof NewsletterImages } = {};
  const state: unknown[] = [];
  let stateIndex = 0;
  const mocks: Record<string, unknown> = {
    react: {
      useId: () => "images-test",
      useRef: () => ({ current: null }),
      useState: (initial: unknown) => {
        const index = stateIndex++;
        state[index] = initial;
        return [initial, (value: unknown) => { state[index] = value; }];
      },
    },
    "@/lib/assets/core": { IMAGE_TYPES, MAX_ASSET_BYTES },
    "./PictureDrop": { fitPicture: async (file: File) => file },
  };
  const bodies: FormData[] = [];
  const changed: unknown[][] = [];
  const pending: boolean[] = [];
  const fetch = async (url: string, init: { body: FormData }) => {
    assert.equal(url, "/api/workspace/newsletter/november/images");
    bodies.push(init.body);
    if (bodies.length === 2) throw new Error("offline");
    return { ok: true, json: async () => ({ ok: true, images: [image, { ...image, id: `saved-${bodies.length}` }] }) };
  };
  new Function("require", "exports", "fetch", source)((id: string) => mocks[id] ?? require(id), exports, fetch);
  const tree = exports.NewsletterImages!({ ...props, onChange: (images: unknown[]) => changed.push(images), onBusyChange: (busy) => pending.push(busy) });
  const picker = elements(tree).find((element) => element.type === "input" && element.props.type === "file");
  const event = { currentTarget: { value: "selected", files: [
    new File(["image"], "first.png", { type: "image/png" }),
    new File(["image"], "retry.jpg", { type: "image/jpeg" }),
    new File(["file"], "not-an-image.pdf", { type: "application/pdf" }),
    new File(["image"], "last.webp", { type: "image/webp" }),
  ] } };
  await (picker!.props.onChange as (value: typeof event) => Promise<void>)(event);
  assert.equal(event.currentTarget.value, "");
  assert.equal(bodies.length, 3);
  assert.equal(changed.length, 2);
  for (const body of bodies) {
    assert.equal(body.get("targetType"), "piece");
    assert.equal(body.get("targetId"), "piece-1");
    assert.equal(body.getAll("files").length, 1);
  }
  assert.equal(state[0], false);
  assert.deepEqual(pending, [true, false]);
  assert.equal(state[1], "2 pictures saved.");
  const failures = state[2] as string[];
  assert.equal(failures.length, 2);
  assert.match(failures.join(" "), /retry.jpg: connection lost/);
  assert.match(failures.join(" "), /not-an-image.pdf: use PNG/);
});
