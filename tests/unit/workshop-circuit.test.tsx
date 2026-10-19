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

test("the approved LED retains large-text contrast at its dimmest point over a white surface", () => {
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  const glass = css.match(/background-color: rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/)!;
  const opacity = Math.min(...Array.from(css.matchAll(/(?:82|92)% \{ opacity: ([\d.]+); \}/g), m => Number(m[1])));
  const background = glass.slice(1, 4).map(n => Number(n) * Number(glass[4]) / 100 + 255 * (1 - Number(glass[4]) / 100));
  const foreground = [39, 155, 88].map((n, i) => n * opacity + background[i] * (1 - opacity));
  const luminance = (rgb: number[]) => rgb.reduce((sum, n, i) => {
    const channel = n / 255;
    return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  assert.ok((luminance(foreground) + .05) / (luminance(background) + .05) >= 3);
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

test("only the compact approved display gets a green LED; counts stay available as text", () => {
  const cap = sessionCapacity(30, [{ status: "confirmed" }, { status: "pending" }]);
  const html = renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap, compact: true }));
  assert.match(html, /class="training-seat-approved"/);
  assert.match(html, /data-dot-matrix="1"/);
  assert.match(html, /<span class="sr-only">1<\/span>/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(WorkshopRegistrationSummary, { cap })), /training-seat-approved/);
});

test("glass and subtle power animations have reduced-motion and forced-color fallbacks", () => {
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /backdrop-filter: blur\(5px\)/);
  assert.match(css, /training-seat-approved dd \{ color: #279b58/);
  assert.match(css, /training-led-flicker 23s/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.training-circuit-power, \.training-seat-approved svg \{ animation: none; \}/);
  assert.match(css, /\.training-workshop-circuit \{ display: none; \}/);
});
