import assert from "node:assert/strict";
import test from "node:test";
import { showReportAnchor } from "../../src/components/workspace/PageReviewClient";

test("Show me highlights matching text, rejects a missing quote, and supports explicit page feedback", async () => {
  const seen: string[] = [];
  const boxes: any[] = [];
  const rect = { top: 5000, left: 40, width: 600, height: 120 };
  const el = (name: string, text: string) => ({
    name, textContent: text,
    closest: () => ({ getAttribute: (key: string) => key === "data-section" ? "venturelift" : null }),
    getBoundingClientRect: () => rect,
    scrollIntoView: (opts: { behavior: string }) => { seen.push(`scroll:${name}:${opts.behavior}`); rect.top = 300; },
  });
  const heading = el("h2", "Programme highlights");
  const para = el("p", "The   VentureLift cohort\n pitched to investors on day two.");
  const article = el("article", "");
  const sheet = { querySelectorAll: () => [heading, para], querySelector: () => article };
  (globalThis as any).document = {
    getElementById: (id: string) => id === "report-frame-venturelift-0" ? sheet : null,
    querySelectorAll: () => [heading, para],
    querySelector: () => boxes.find((b) => b.isConnected) ?? null,
    createElement: () => {
      const box: any = { style: {}, isConnected: false, setAttribute() {}, remove() { box.isConnected = false; },
        animate: (_k: unknown, o: { iterations: number }) => { box.blinks = o.iterations; return {}; } };
      boxes.push(box);
      return box;
    },
    body: { appendChild: (b: any) => { b.isConnected = true; } },
  };
  (globalThis as any).window = Object.assign(globalThis, { matchMedia: () => ({ matches: false }), innerHeight: 800 });

  assert.equal(showReportAnchor("#report-frame-venturelift-0", "VentureLift cohort pitched to investors"), true);
  assert.deepEqual(seen.splice(0), ["scroll:p:auto"], "a far target jumps instead of gliding");
  await new Promise((r) => setTimeout(r, 300));
  const box = boxes.at(-1);
  assert.equal(box.style.display, "block");
  assert.equal(box.style.top, "296px", "the box sits on the passage after the scroll");
  assert.equal(box.blinks, 5);

  assert.equal(showReportAnchor("#report-frame-venturelift-0", "text that was edited away"), false);
  assert.deepEqual(seen.splice(0), [], "a missing quote must not highlight unrelated page content");
  assert.equal(showReportAnchor("#report-frame-venturelift-0", null), true);
  assert.deepEqual(seen.splice(0), ["scroll:article:smooth"], "explicit page feedback still scrolls to its page");
  assert.equal(showReportAnchor("#report-frame-removed-0", "anything"), false);
  assert.deepEqual(seen, []);
  await new Promise((r) => setTimeout(r, 2600));
});
