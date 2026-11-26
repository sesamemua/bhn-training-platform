import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createHtmlReviewTargets } from "../../src/lib/page-review/html-targets";
import { pasteDocument } from "../../src/lib/page-review/paste-document";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
function fixture() {
  const doc: Document = new JSDOM(`<h2>First workshop</h2><p data-nl-piece="first" data-nl-part="CTA"><a href="/same">Register</a></p>
    <h2>Second workshop</h2><p data-nl-piece="second" data-nl-part="CTA"><a href="/same">Register</a></p>
    <p data-nl-piece="second" data-nl-part="Picture 1" data-nl-image="photo"><a href="/photo"><img alt="Workshop" src="/photo.png"></a></p>`).window.document;
  return { doc, targets: createHtmlReviewTargets(doc) };
}
test("same-text CTAs target their paragraph and keep article identity when the layout moves", () => {
  const { doc, targets } = fixture();
  const node = doc.querySelectorAll("a")[1];
  const anchor = targets.capture(node);
  doc.body.prepend(node.parentElement!);
  assert.equal(targets.find(anchor), node.parentElement);
  node.parentElement!.remove();
  assert.equal(targets.find(anchor), null, "never fall back to the other Register button");
});
test("inline links and emphasis share one paragraph or list-item target", () => {
  const doc: Document = new JSDOM(`<h2>Training opportunities</h2><p>Build practical skills with <a href="/castl"><strong>CASTL</strong></a> and <a href="/biozone">BioZone</a>.</p>
    <ul><li><p>Master’s and PhD trainees can receive <strong>$25,000</strong> in support.</p></li></ul>`).window.document;
  const targets = createHtmlReviewTargets(doc), paragraph = doc.querySelector("p")!, item = doc.querySelector("li")!;
  for (const node of paragraph.querySelectorAll("a,strong")) {
    assert.equal(targets.pick(node), paragraph);
    const anchor = targets.capture(node);
    assert.equal(anchor.anchorQuote, paragraph.textContent);
    assert.equal(targets.find(anchor), paragraph);
  }
  assert.equal(targets.pick(item.querySelector("strong")!), item);
  assert.equal(targets.capture(item.querySelector("strong")!).anchorQuote, item.textContent);
});
test("legacy link anchors resolve to the same semantic paragraph without changing their saved quote", () => {
  const { doc, targets } = fixture();
  const anchor = { anchorKey: 'bhn-html:{"tag":"A","piece":"second","part":"CTA"}', anchorQuote: "Register", anchorBlock: "Second workshop" };
  assert.equal(targets.find(anchor), doc.querySelectorAll("p")[1]);
  assert.equal(anchor.anchorQuote, "Register");
  assert.equal(targets.findLegacy({ anchorQuote: "Register", anchorPath: "p[data-nl-piece=second] > a" }, true), doc.querySelectorAll("p")[1]);
});
test("preserved wording blocks are semantic review targets without swallowing the CTA", () => {
  for (const attribute of ['data-preserved-wording="true"', 'data-nl-part="Original wording"']) {
    const doc: Document = new JSDOM(`<div data-nl-piece="ke"><div ${attribute}><strong>Knowledge Exchange</strong> updates</div><a href="/ke">Apply</a></div>`).window.document;
    const targets = createHtmlReviewTargets(doc), block = doc.querySelector("strong")!.parentElement!, cta = doc.querySelector("a")!;
    assert.equal(targets.isVerbatimBlock(block), true);
    assert.equal(targets.pick(block.querySelector("strong")!), block);
    assert.equal(targets.find(targets.capture(block)), block);
    assert.equal(targets.pick(cta), cta);
  }
});
test("linked images target the image and retain stable image identity", () => {
  const { doc, targets } = fixture();
  const image = doc.querySelector("img")!;
  assert.equal(targets.pick(image), image);
  const anchor = targets.capture(image);
  image.alt = "Corrected description";
  assert.equal(targets.find(anchor), image);
  image.parentElement!.parentElement!.setAttribute("data-nl-image", "replacement");
  assert.equal(targets.find(anchor), null);
});
test("image identity on the image itself remains locatable under a piece parent", () => {
  const doc: Document = new JSDOM('<p data-nl-piece="event" data-nl-part="Picture"><a href="/event"><img data-nl-image="photo-1" alt="Event" src="/event.png"></a></p>').window.document;
  const targets = createHtmlReviewTargets(doc), image = doc.querySelector("img")!;
  const anchor = targets.capture(image);
  image.alt = "Updated event picture";
  assert.equal(targets.find(anchor), image);
  image.setAttribute("data-nl-image", "photo-2");
  assert.equal(targets.find(anchor), null, "a replacement image cannot steal the old identity");
});
test("ambiguous and unknown targets are not silently reattached", () => {
  const { doc, targets } = fixture();
  const link = doc.querySelectorAll("a")[1];
  const anchor = targets.capture(link);
  link.parentElement!.append(link.cloneNode(true));
  assert.equal(targets.find(anchor), null);
  assert.equal(targets.find({ anchorKey: "bhn-html:not json" }), null);
  assert.equal(targets.pick(doc.body), null);
});
test("rendered round is bound to the HTML, independently of later polling", () => {
  assert.match(pasteDocument("<p>Old version</p>", "/overlay.js", "Issue", 3), /data-round="3"/);
  assert.doesNotMatch(pasteDocument("<p>Old version</p>", "/overlay.js", "Issue", NaN), /data-round/);
});
