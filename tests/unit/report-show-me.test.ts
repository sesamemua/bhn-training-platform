import assert from "node:assert/strict";
import test from "node:test";
import { showReportAnchor } from "../../src/components/workspace/PageReviewClient";

test("Show me finds the quoted block on a report page, else the page, else reports not found", () => {
  const seen: string[] = [];
  const el = (name: string, text: string) => ({
    name, textContent: text,
    scrollIntoView: () => seen.push(`scroll:${name}`),
    animate: () => seen.push(`flash:${name}`),
  });
  const heading = el("h2", "Programme highlights");
  const para = el("p", "The   VentureLift cohort\n pitched to investors on day two.");
  const article = el("article", "");
  const sheet = { querySelectorAll: () => [heading, para], querySelector: () => article };
  (globalThis as any).document = { getElementById: (id: string) => id === "report-frame-venturelift-0" ? sheet : null };
  (globalThis as any).window = { matchMedia: () => ({ matches: true }) };

  assert.equal(showReportAnchor("#report-frame-venturelift-0", "VentureLift cohort pitched to investors"), true);
  assert.deepEqual(seen.splice(0), ["scroll:p", "flash:p"]);
  assert.equal(showReportAnchor("#report-frame-venturelift-0", "text that was edited away"), true);
  assert.deepEqual(seen.splice(0), ["scroll:article", "flash:article"]);
  assert.equal(showReportAnchor("#report-frame-venturelift-0", null), true);
  assert.deepEqual(seen.splice(0), ["scroll:article", "flash:article"]);
  assert.equal(showReportAnchor("#report-frame-removed-0", "anything"), false);
  assert.deepEqual(seen, []);
});
