import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SymposiumRegistrationPilot } from "../../src/components/admin/events/SymposiumRegistrationPilot";

const render = (credentialsPresent = false, webhookPresent = false) => renderToStaticMarkup(createElement(SymposiumRegistrationPilot, { credentialsPresent, webhookPresent }));

test("native pilot removes all Luma embeds, checkout links and guest-sync dependencies", () => {
  const html = render();
  assert.match(html, /Direct Stripe connection required/);
  assert.match(html, /href="https:\/\/dashboard.stripe.com\/"/);
  assert.doesNotMatch(html, /<iframe|<script|luma\.com|lu\.ma|Sync Luma|Guest list &amp; badges/);
  const source = readFileSync(new URL("../../src/components/admin/events/SymposiumRegistrationPilot.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /print-luma|SYMPOSIUM_LUMA_ID|checkoutUrl|searchParams/);
});

test("missing credentials are explicit and no registration or payment can be submitted", () => {
  const html = render();
  assert.equal((html.match(/Not configured/g) ?? []).length, 2);
  assert.match(html, /Payments and registration remain disabled/);
  assert.doesNotMatch(html, /<form|<input|<button|\/api\/events\/|sk_live_|whsec_/);
});

test("credential presence is never presented as a verified connection or enabled checkout", () => {
  for (const flags of [[true, false], [false, true], [true, true]]) {
    const html = render(...flags);
    assert.match(html, /Admin-only pilot · Inactive/);
    assert.match(html, /not yet verified/);
    assert.doesNotMatch(html, /<form|<button|checkout.session|gtag\(|dataLayer/);
  }
});

test("pilot route remains admin protected, non-indexable and only passes credential-presence booleans", () => {
  const route = readFileSync(new URL("../../src/app/(dashboard)/admin/workspace/symposium-2026/registration-pilot/page.tsx", import.meta.url), "utf8");
  assert.match(route, /requireRole\("admin"\)/);
  assert.ok(route.indexOf('requireRole("admin")') < route.indexOf("<SymposiumRegistrationPilot"));
  assert.match(route, /deniedRedirect\(/);
  assert.match(route, /index: false, follow: false/);
  assert.match(route, /credentialsPresent=\{stripeConfigured\(\)\}/);
  assert.match(route, /webhookPresent=\{Boolean\(process.env.STRIPE_WEBHOOK_SECRET\)\}/);
  assert.doesNotMatch(route, /prisma\.|\.create\(|\.update\(|searchParams|LUMA_SESSION_KEY/);
});
