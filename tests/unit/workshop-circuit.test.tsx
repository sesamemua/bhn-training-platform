import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkshopCircuit } from "../../src/components/training-week/WorkshopCircuit";
import { WorkshopRegistrationSummary } from "../../src/components/training-week/WorkshopRegistrationSummary";
import { sessionCapacity } from "../../src/lib/training-week/capacity";
import { CapacityMonitor } from "../../src/components/training-week/CapacityMonitor";

test("shared workshop dashboard omits circuit decoration while retaining neon titles and seat statistics", () => {
  const cap = sessionCapacity(30, [{ status: "confirmed" }, { status: "pending" }]);
  const html = renderToStaticMarkup(createElement(CapacityMonitor, {
    sessions: [{ id: "workshop-1", slug: "workshop", title: "Workshop", start: "2026-10-26T13:00:00Z", cap }],
  }));
  assert.doesNotMatch(html, /training-workshop-circuit|training-circuit-power/);
  assert.match(html, /training-workshop-title/);
  assert.match(html, /training-seat-approved/);
  assert.match(html, /requested \/ capacity/);
});

test("each workshop has a stable, distinct decorative circuit without interactive or spoken content", () => {
  const boards = ["microbix", "pandemic", "communication", "negotiation", "ccrm", "ignited"].map(seed => {
    const html = renderToStaticMarkup(createElement(WorkshopCircuit, { seed }));
    assert.equal(html, renderToStaticMarkup(createElement(WorkshopCircuit, { seed })));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /training-circuit-power/);
    assert.doesNotMatch(html, /NaN|undefined|Infinity|<text|<button|<a\b/);
    return html.match(/<path d="([^"]+)"/)![1];
  });
  assert.equal(new Set(boards).size, 6);
});

test("only the compact approved display gets a green LED", () => {
  const cap = sessionCapacity(30, [{ status: "confirmed" }, { status: "pending" }]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap, compact: true }));
  assert.match(html, /class="training-seat-approved"/);
  assert.match(html, /data-dot-matrix="1"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap })), /training-seat-approved/);
});

test("glass and subtle power animations are styled", () => {
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /backdrop-filter: blur\(5px\)/);
  assert.match(css, /training-seat-approved dd \{ color: #279b58/);
  assert.match(css, /training-led-flicker 23s/);
});
