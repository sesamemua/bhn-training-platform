import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { hasRichLink, parseRich, plainRich } from "../../src/lib/formbuilder/rich-text";
import { RichText } from "../../src/components/forms/RichText";
import { parseForm } from "../../src/lib/formbuilder/types";

const LUMA = "To register, visit [BioHubNet 2026 Annual Symposium · Luma](https://luma.com/wh30nh1n).";

test("a labelled link keeps its own words and its address", () => {
  const [p] = parseRich(LUMA);
  assert.deepEqual(p.find((x) => "href" in x), { text: "BioHubNet 2026 Annual Symposium · Luma", href: "https://luma.com/wh30nh1n" });
  assert.equal(plainRich(LUMA), "To register, visit BioHubNet 2026 Annual Symposium · Luma.");
});

test("each line is its own paragraph; blank lines add nothing", () => {
  assert.equal(parseRich("One.\n\nTwo.\nThree.").length, 3);
  assert.deepEqual(parseRich(""), []);
});

test("**bold** is bold, and a bare domain still links", () => {
  const [p] = parseRich("**PLEASE NOTE:** read biohubnet.ca first.");
  assert.deepEqual(p[0], { text: "PLEASE NOTE:", bold: true });
  assert.ok(p.some((x) => "href" in x && x.href === "https://biohubnet.ca"));
});

test("anything that does not match exactly stays literal text", () => {
  // A javascript: link must never become an anchor on a public page.
  for (const s of ["[click](javascript:alert(1))", "[unclosed](https://x.ca", "a ** b", "**"]) {
    assert.equal(plainRich(s), s, s);
    assert.ok(!renderToStaticMarkup(<RichText text={s} />).includes('href="javascript'), s);
  }
  assert.equal(hasRichLink("[click](javascript:alert(1))"), false);
});

test("renders paragraphs as block spans, links open safely in a new tab", () => {
  const html = renderToStaticMarkup(<RichText text={`Intro.\n${LUMA}`} />);
  assert.match(html, /^<span class="block"><span>Intro\.<\/span><\/span><span class="block mt-2">/);
  assert.match(html, /<a href="https:\/\/luma.com\/wh30nh1n" target="_blank" rel="noopener noreferrer"[^>]*>BioHubNet 2026 Annual Symposium · Luma<\/a>/);
  assert.doesNotMatch(html, /<p/);
});

test("presentation survives parseForm; a form without it is unchanged", () => {
  const withIt = parseForm({ fields: [], presentation: { theme: "site", richText: true, intro: ["Hi"] } });
  assert.deepEqual(withIt.presentation, { theme: "site", richText: true, intro: ["Hi"] });
  const without = parseForm({ fields: [], submitNote: "x" });
  assert.equal("presentation" in without, false);
  // Malformed is dropped whole, not half-applied.
  assert.equal("presentation" in parseForm({ fields: [], presentation: { theme: "neon" } }), false);
  assert.equal("presentation" in parseForm({ fields: [], presentation: {} }), false);
});

test("slot capacity survives parseForm", () => {
  const doc = parseForm({ fields: [{ id: "f", key: "sessions", label: "S", type: "multi", options: ["A"], slots: [{ option: "A", day: "2026-10-27", start: "13:00", end: "16:30", capacity: 30 }] }] });
  assert.equal(doc.fields[0].slots[0].capacity, 30);
});
