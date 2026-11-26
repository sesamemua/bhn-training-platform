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
test("same-text links keep article identity when the layout moves", () => {
  const { doc, targets } = fixture();
  const node = doc.querySelectorAll("a")[1];
  const anchor = targets.capture(node);
  doc.body.prepend(node.parentElement!);
  assert.equal(targets.find(anchor), node);
  node.parentElement!.remove();
  assert.equal(targets.find(anchor), null, "never fall back to the other Register button");
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
