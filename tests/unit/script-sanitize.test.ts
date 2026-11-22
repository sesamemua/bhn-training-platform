import test from "node:test";
import assert from "node:assert/strict";
import { parseRichContent, sanitizeScriptCss } from "../../src/lib/scripts/sanitize";
import { sanitizeRichContent } from "../../src/lib/scripts/sanitize-server";
import { docPanelChunks } from "../../src/lib/scripts/content";
import { MOLLY_CSS, MOLLY_HTML } from "../../src/lib/scripts/molly-html";
import { SPONSORSHIP_CSS, SPONSORSHIP_HTML } from "../../src/lib/scripts/sponsorship-html";
import { SYMPOSIUM_CSS, SYMPOSIUM_HTML } from "../../src/lib/scripts/symposium-comms-html";

const clean = (html: string, css = "") =>
  sanitizeRichContent({ kind: "html", html, css }) as { html: string; css: string };

test("shared script content is stripped of XSS and keeps editor markup", () => {
  const dirty = clean(
    `<img src="x" onerror="alert(1)"><p onclick="alert(2)">Hi</p><script>alert(3)</script>` +
      `<a href="javascript:alert(4)">a</a><a href="JaVa&#10;Script:alert(5)">b</a>` +
      `<style>*{background:url(//evil.test)}</style><p style="background:u\\72l(//evil.test)">c</p>`,
  ).html;
  assert.doesNotMatch(dirty, /onerror|onclick|<script|javascript:|<style|evil\.test/i);

  const editor =
    `<div class="doc-panel active" data-tab="plan"><div class="gantt"><div class="gantt-row">` +
    `<div class="gantt-label"><span class="gantt-label-text" contenteditable="true">Row</span>` +
    `<span class="gantt-row-ctrls" contenteditable="false"><button type="button" class="gantt-ctrl" title="Up" aria-label="Move row up">▲</button></span></div>` +
    `<div class="bar teal" data-track="t1" data-mirror-label="1" style="grid-column:4 / 7">Bar</div></div></div>` +
    `<table><thead><tr><th colspan="2">When</th></tr></thead><tbody><tr data-track="t1"><td>Aug</td><td>Goal</td></tr></tbody></table></div>`;
  assert.equal(clean(editor).html, editor);
  assert.deepEqual([...docPanelChunks(clean(editor).html).keys()], ["plan"]);

  for (const [html, css] of [[MOLLY_HTML, MOLLY_CSS], [SYMPOSIUM_HTML, SYMPOSIUM_CSS], [SPONSORSHIP_HTML, SPONSORSHIP_CSS]]) {
    const saved = clean(html, css);
    assert.equal(saved.css, css);
    assert.equal(clean(saved.html).html, saved.html);
    assert.equal((saved.html.match(/<[a-z]/gi) ?? []).length, (html.match(/<[a-z]/gi) ?? []).length);
  }

  for (const css of ["@import 'x.css';", "a{background:URL(x)}", "a{background:u\\72 l(x)}", "@\\69mport 'x';", "</style><script>alert(1)</script>"]) {
    assert.equal(sanitizeScriptCss(css), "", css);
  }
  assert.equal(parseRichContent({ kind: "html", html: ["<img onerror=x>"], css: "" }, "html"), undefined);
  assert.equal(parseRichContent(null, "html"), undefined);
});
