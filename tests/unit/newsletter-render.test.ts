import test from "node:test";
import assert from "node:assert/strict";
import { renderIssue } from "../../src/lib/newsletter/render";
import { buildAiBrief } from "../../src/lib/newsletter/handoff";
import { SECTIONS, type NewsletterImage, type PieceLayout, type Section } from "../../src/lib/newsletter/types";

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

const picture = (id: string, alt = id): NewsletterImage => ({ id, assetId: id, url: `https://images.example/${id}.png`, alt });

test("multiple section and contribution pictures render in order with uncropped email sizing", () => {
  const html = renderIssue({
    dateline: "November 2026",
    bySection: { ...empty(), event: [{ ...piece("Partner event"), subhead: "Join us", ctaUrl: "https://event.example/?a=1&b=2", ctaLabel: "Register" }] },
    idsBySection: { event: ["event-1"] },
    sectionImages: { event: [picture("section-first"), picture("section-second")] },
    imagesByPieceId: { "event-1": [picture("piece-first"), picture("piece-second")] },
  });
  const positions = ["EVENTS", "section-first.png", "section-second.png", "Partner event", "Join us", "piece-first.png", "piece-second.png", "Partner event body."].map((text) => html.indexOf(text));
  assert.ok(positions.every((position, i) => position >= 0 && (!i || position > positions[i - 1])));
  assert.equal((html.match(/<img /g) ?? []).length, 4);
  assert.match(html, /data-nl-piece="event-1" data-nl-part="Picture 1"/);
  assert.match(html, /data-nl-piece="section-event"/);
  assert.match(html, /width="512"[^>]*width:100%; max-width:512px; height:auto/);
  assert.match(html, /href="https:\/\/event.example\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(html, /object-fit|height="\d+"[^>]*alt=/);
});

test("a section can contain pictures without a text contribution, and absent maps preserve legacy output", () => {
  const input = { dateline: "November 2026", bySection: empty() };
  const html = renderIssue({ ...input, sectionImages: { equip: [picture("poster-1"), picture("poster-2")] } });
  assert.match(html, /EQUIP/);
  assert.equal((html.match(/<img /g) ?? []).length, 2);
  assert.doesNotMatch(html, /ENGAGE|EXPERIENCE/);
  assert.equal(renderIssue(input), renderIssue({ ...input, sectionImages: {}, imagesByPieceId: {} }));
});

test("pictures escape attributes, reject unsafe and non-HTTPS sources, and never include unselected pieces", () => {
  const html = renderIssue({
    dateline: "November 2026", bySection: empty(),
    sectionImages: { top: [
      { ...picture('safe"id', '" <Poster> & caption'), url: 'https://images.example/a.png?x="&y=2' },
      { ...picture("javascript"), url: "javascript:alert(1)" },
      { ...picture("data"), url: "data:image/svg+xml,<svg/>" },
      { ...picture("http"), url: "http://images.example/insecure.png" },
    ] },
    imagesByPieceId: { excluded: [picture("excluded")] },
  });
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /alt="&quot; &lt;Poster&gt; &amp; caption"/);
  assert.match(html, /data-nl-image="safe&quot;id"/);
  assert.match(html, /a.png\?x=&quot;&amp;y=2/);
  assert.doesNotMatch(html, /javascript:|data:image|insecure.png|excluded.png/);
});
