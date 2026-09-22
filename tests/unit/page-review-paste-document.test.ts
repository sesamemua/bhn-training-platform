import test from "node:test";
import assert from "node:assert/strict";
import { isWholeDocument, pasteDocument, stripScripts } from "../../src/lib/page-review/paste-document";

const OVERLAY = "https://bhn.example/api/public/page-review/tok/overlay.js";
const NEWSLETTER =
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Sep Newsletter</title>` +
  `<style>table{border-collapse:collapse}</style></head>` +
  `<body style="margin:0"><table><tr><td>Top story</td></tr></table></body></html>`;

test("a pasted document is served as the document, not inside another one", () => {
  // The bug this exists to stop: a nested document loses its html,
  // head and body tags, and a table's contents get foster-parented out
  // in front of it — forty tables became a page nobody could scroll.
  const out = pasteDocument(NEWSLETTER, OVERLAY, "Sep Newsletter");
  assert.equal(out.match(/<html\b/gi)?.length, 1, "two <html> tags means it was nested");
  assert.equal(out.match(/<body\b/gi)?.length, 1);
  assert.ok(out.startsWith("<!doctype html>"), "the paste's own doctype leads");
  assert.match(out, /<body style="margin:0">/, "the paste's body attributes survive");
});

test("the overlay goes in before the closing body tag, and only once", () => {
  const out = pasteDocument(NEWSLETTER, OVERLAY, "t");
  assert.equal(out.match(/overlay\.js/g)?.length, 1);
  assert.ok(out.indexOf("overlay.js") < out.lastIndexOf("</body>"), "it must run against a finished document");
  assert.match(out, /<script src="[^"]+overlay\.js" defer><\/script>/);
});

test("a document with no closing body tag still gets the overlay", () => {
  const out = pasteDocument(`<!doctype html><html><body><p>Hi`, OVERLAY, "t");
  assert.match(out, /overlay\.js/);
});

test("a fragment keeps the wrapper, with the review's title", () => {
  const out = pasteDocument(`<div class="hero">Hello</div>`, OVERLAY, 'A "review" <of> stuff');
  assert.match(out, /^<!doctype html>/);
  assert.match(out, /<title>A review of stuff<\/title>/, "the title is escaped, not injected");
  assert.match(out, /<div class="hero">Hello<\/div>/);
  assert.match(out, /overlay\.js/);
});

test("whatever the paste brought as a script does not run", () => {
  const nasty = `<!doctype html><html><body><script>fetch('/steal')</script><p>ok</p>` +
    `<SCRIPT SRC="//evil.example/x.js"></SCRIPT><script src="//evil.example/y.js"><p>after</body></html>`;
  const out = pasteDocument(nasty, OVERLAY, "t");
  assert.doesNotMatch(out, /evil\.example/);
  assert.doesNotMatch(out, /fetch\('\/steal'\)/);
  assert.equal(out.match(/<script/gi)?.length, 1, "only the overlay's script is left");
  assert.match(out, /<p>ok<\/p>/, "the page itself is untouched");
  assert.equal(stripScripts("<p>a</p>"), "<p>a</p>");
});

test("what counts as a whole document", () => {
  assert.equal(isWholeDocument("<!DOCTYPE html><html></html>"), true);
  assert.equal(isWholeDocument("\n  <html lang=\"en\">"), true);
  assert.equal(isWholeDocument("<!-- exported 2026-09-22 -->\n<!doctype html><html>"), true, "a leading comment is still a document");
  assert.equal(isWholeDocument("<div><html-ish/></div>"), false);
  assert.equal(isWholeDocument("<table><tr><td>hi</td></tr></table>"), false);
});
