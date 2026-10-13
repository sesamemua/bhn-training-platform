import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AdminDashboardCards } from "../../src/components/dashboards/AdminDashboardCards";
import { DEFAULT_CARD_ORDER, type DashboardCard } from "../../src/lib/dashboard/card-order";

const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
function render(order: DashboardCard[] | null) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router}>
    <AdminDashboardCards sessions={[]} saveCapacity={async () => ({ ok: true })} saveWorkshopState={async () => ({ ok: true })}
      initialLayout={order ? { order, version: null } : null} releasedSeats={<article>Released seats fixture</article>} />
  </AppRouterContext.Provider>);
}
test("homepage reuses speaker actions and renders each shared card once in the stored order", () => {
  for (const order of [DEFAULT_CARD_ORDER, [...DEFAULT_CARD_ORDER].reverse()]) {
    const html = render(order);
    assert.deepEqual([...html.matchAll(/data-dashboard-card="([^"]+)"/g)].map((match) => match[1]), order);
    assert.equal((html.match(/Headshots &amp; bios action items/g) ?? []).length, 3); // heading and the two accessible move labels
    assert.match(html, /aria-label="Speaker action items"/);
    assert.equal((html.match(/Released seats fixture/g) ?? []).length, 1);
    assert.match(html, /Shared admin layout/);
  }
});
test("move controls are accessible, bounded, and disabled before the shared order loads", () => {
  const buttons = (html: string) => html.match(/<button\b[^>]*aria-label="Move [^"]+"[^>]*>/g) ?? [];
  const loaded = buttons(render(DEFAULT_CARD_ORDER));
  assert.equal(loaded.length, 12);
  assert.match(loaded[0], / disabled=""/);
  assert.match(loaded[11], / disabled=""/);
  assert.doesNotMatch(loaded[1], / disabled=""/);
  assert.ok(buttons(render(null)).every((button) => / disabled=""/.test(button)));
});
