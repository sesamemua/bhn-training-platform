import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WORKSHOP_ICONS, WorkshopIcon } from "../../src/components/training-week/WorkshopIcon";
import { SESSIONS } from "../../src/lib/training-week/schedule-2026";
import { CapacityMonitor } from "../../src/components/training-week/CapacityMonitor";
import { sessionCapacity } from "../../src/lib/training-week/capacity";
import sharp from "sharp";

test("every current session has its own icon, keyed by stable slug rather than title or order", () => {
  assert.deepEqual(Object.keys(WORKSHOP_ICONS).sort(), SESSIONS.map((s) => s.slug).sort());
  const icons = SESSIONS.map((s) => renderToStaticMarkup(createElement(WorkshopIcon, { slug: s.slug })));
  assert.equal(new Set(icons).size, SESSIONS.length);
  for (const svg of icons) {
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /width="22" height="22"/);
  }
  assert.doesNotThrow(() => renderToStaticMarkup(createElement(WorkshopIcon, { slug: "future-session" })));
});

test("the shared dashboard keeps named workshop links and capacity data alongside decorative icons", () => {
  const html = renderToStaticMarkup(createElement(CapacityMonitor, { sessions: SESSIONS.map((s) => ({
    id: s.slug, slug: s.slug, title: s.title, start: "2026-10-26T10:00:00Z", cap: sessionCapacity(20, []),
  })) }));
  for (const s of SESSIONS) assert.ok(html.includes(`aria-label="View registrants for ${s.title.replaceAll("&", "&amp;")}"`));
  assert.equal((html.match(/class="lucide lucide-/g) ?? []).length, SESSIONS.length + 1);
  assert.match(html, /0\/20<\/strong> requested/);
});

test("the rounded chameleon exports its filled silhouette in teal with a transparent eye cutout", async () => {
  const png = "public/workshop-icons/communication-chameleon.png";
  const body = await sharp(png).extract({ left: 192, top: 235, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...body], [15, 118, 110, 255]);
  const eye = await sharp(png).extract({ left: 328, top: 213, width: 1, height: 1 }).raw().toBuffer();
  assert.equal(eye[3], 0, "eye remains transparent on light and dark backgrounds");
});

test("the friendly chameleon has no speech bubble", () => {
  const icon = renderToStaticMarkup(createElement(WorkshopIcon, { slug: "communication-chameleon-2026" }));
  assert.equal(WORKSHOP_ICONS["communication-chameleon-2026"].symbol, "Chameleon");
  assert.equal((icon.match(/<path /g) ?? []).length, 3, "silhouette, spiral tail and curved feet only");
  assert.match(icon, /fill-rule="evenodd"/);
});
