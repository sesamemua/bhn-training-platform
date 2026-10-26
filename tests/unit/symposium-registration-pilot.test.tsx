import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SymposiumRegistrationPilot } from "../../src/components/admin/events/SymposiumRegistrationPilot";
import { SYMPOSIUM_LUMA_ID } from "../../src/lib/events/print-luma";

const render = (searchParams = {}) => renderToStaticMarkup(createElement(SymposiumRegistrationPilot, { searchParams }));

test("pilot uses the actual symposium Luma embed with payment permission and an accessible title", () => {
  const html = render();
  assert.ok(html.includes(`https://luma.com/embed/event/${SYMPOSIUM_LUMA_ID}/simple?utm_source=training-platform-pilot`));
  assert.match(html, /title="BioHubNet Annual Symposium registration and payment"/);
  assert.match(html, /allow="fullscreen; payment"/);
  assert.match(html, /width="100%"/);
  assert.match(html, /not a payment sandbox/);
  assert.match(html, /does not reopen registration/);
  assert.match(html, /href="\/admin\/workspace\/symposium-2026\/print"/);
  assert.doesNotMatch(html, /<form|<input|<script|\/api\/events\/|session-key|sk_live_/);
});

test("campaign values survive the embedded checkout without passing private or checkout-control parameters", () => {
  const html = render({
    utm_source: ["newsletter", "ignored"], utm_campaign: "symposium & training", gclid: "click-123",
    email: "private@example.org", token: "secret", coupon: "unlock", event_id: "evt-other", redirect: "https://example.org",
  });
  const url = new URL(html.match(/<iframe[^>]+src="([^"]+)"/)![1].replaceAll("&amp;", "&"));
  assert.equal(url.origin, "https://luma.com");
  assert.equal(url.pathname, `/embed/event/${SYMPOSIUM_LUMA_ID}/simple`);
  assert.deepEqual(Object.fromEntries(url.searchParams), { utm_source: "newsletter", utm_campaign: "symposium & training", gclid: "click-123" });
  assert.doesNotMatch(html, /private@example.org|secret|evt-other|example.org|unlock/);
});

test("pilot does not claim a checkout visit is a completed registration or successful payment", () => {
  const html = render();
  assert.match(html, /not proof of payment/);
  assert.match(html, /does not register anyone/);
  assert.doesNotMatch(html, /gtag\(|dataLayer|payment_status|registration_complete|checkout\.sessions/);
});

test("pilot route remains admin protected, non-indexable and independent from public registration", () => {
  const route = readFileSync(new URL("../../src/app/(dashboard)/admin/workspace/symposium-2026/registration-pilot/page.tsx", import.meta.url), "utf8");
  assert.match(route, /requireRole\("admin"\)/);
  assert.ok(route.indexOf('requireRole("admin")') < route.indexOf("<SymposiumRegistrationPilot"));
  assert.match(route, /deniedRedirect\(/);
  assert.match(route, /index: false, follow: false/);
  assert.doesNotMatch(route, /prisma\.|\.create\(|\.update\(/);
});
