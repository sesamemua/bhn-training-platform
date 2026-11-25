import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { NewsletterClient } from "../../src/components/workspace/NewsletterClient";
import { checkNewsletterHtml } from "../../src/components/workspace/NewsletterExperiments";

test("experimental controls start collapsed and Copy HTML stays outside", () => {
  const issue = {
    id: "sample", title: "Sample newsletter", dateline: "November 2026", status: "generated",
    renderedHtml: "<h1>Sample</h1>", renderedAt: "2026-11-25T15:00:00Z", pieces: [],
  };
  const document = new JSDOM(renderToStaticMarkup(createElement(NewsletterClient, { initialIssue: issue, canEdit: true }))).window.document;
  const disclosure = [...document.querySelectorAll("details")].find((details) => details.querySelector("summary")?.textContent?.includes("Experimental features"));
  assert.ok(disclosure);
  assert.equal(disclosure.open, false);
  for (const label of ["Lay out with AI", "Own AI", "Inbox preview", "HTML preflight"]) {
    assert.ok(disclosure.textContent?.includes(label), label);
  }
  const copy = [...document.querySelectorAll("button")].find((button) => button.textContent === "Copy HTML");
  assert.ok(copy);
  assert.equal(copy.disabled, false);
  assert.equal(disclosure.contains(copy), false);
  const contributor = renderToStaticMarkup(createElement(NewsletterClient, { initialIssue: issue, canEdit: false }));
  assert.doesNotMatch(contributor, /Experimental features|Copy HTML/);
});

test("preflight flags markup problems without rejecting merge tags or decorative images", () => {
  const document = new JSDOM().window.document;
  assert.deepEqual(checkNewsletterHtml(document, `
    <a href="https://example.org/?a=1&amp;b=2"><img src="https://example.org/photo.jpg" alt="Workshop photo"></a>
    <a href="*|UNSUB|*">Unsubscribe</a>
    <a href="mailto:info@example.org">Email</a>
    <a href="#agenda">Agenda</a>
    <a name="agenda"></a>
    <a href="/relative">Relative</a>
    <a href="javascript:void(0)"><img src="/photo.jpg"></a>
    <img src="/decorative.jpg" alt="">
  `), {
    links: 6, images: 3, issues: [
      "Link 5 has a missing or unsupported destination.",
      "Link 6 has a missing or unsupported destination.",
      "Link 6 has no readable label.",
      "Image 2 has no alt attribute.",
    ],
  });
});
