import test from "node:test";
import assert from "node:assert/strict";
import { renderIssue } from "../../src/lib/newsletter/render";
import { buildAiBrief } from "../../src/lib/newsletter/handoff";
import { SECTIONS, type PieceLayout, type Section } from "../../src/lib/newsletter/types";

const piece = (headline: string): PieceLayout => ({ headline, body: [`${headline} body.`] });
const empty = () => Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as Record<Section, PieceLayout[]>;

test("the top story opens the issue, before ENGAGE, on a light band rather than a ribbon", () => {
  const html = renderIssue({ dateline: "September 2026", bySection: { ...empty(), top: [piece("Symposium")], engage: [piece("Pathways")] } });
  const top = html.indexOf("TOP STORY");
  assert.ok(top > 0 && top < html.indexOf("ENGAGE"));
  const band = html.slice(html.lastIndexOf("<tr>", top), top);
  assert.match(band, /background-color:#f3f8fa/);
  assert.doesNotMatch(band, /linear-gradient/);
  assert.ok(html.indexOf("Symposium") < html.indexOf("Pathways"));
});

test("an issue without a top story prints no top-story band", () => {
  const html = renderIssue({ dateline: "September 2026", bySection: { ...empty(), engage: [piece("Pathways")] } });
  assert.doesNotMatch(html, /TOP STORY/);
});

test("the hand-off brief tells another AI to keep the top story light", () => {
  const brief = buildAiBrief([{ id: "t1", section: "top", rawBody: "Symposium registration is open." }], "September 2026");
  assert.match(brief, /### SECTION: top/);
  assert.match(brief, /SECTION top is the issue's top story/);
});
