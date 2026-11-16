import assert from "node:assert/strict";
import test from "node:test";
import {
  advance, buildUtmUrl, csvToPeople, leadScore, matchesFilter, parseCsv,
  pipelineTotals, sanitizeFilter, sanitizeSteps, toCsv,
} from "../../src/lib/outreach/crm";
import { clickSig, openToken, readOpenToken, textToHtml, trackLinks, verifyClick } from "../../src/lib/outreach/crm-track";

process.env.NEXTAUTH_SECRET ??= "crm-unit-test-secret-32-characters!!";

const base = { touches: 0, sends: 0, opens: 0, clicks: 0, forms: 0, registrations: 0, hasAccount: false, unsubscribed: false, lifecycle: "lead" };

test("lead score rewards engagement, caps at 100, zero when unsubscribed", () => {
  assert.equal(leadScore(base), 0);
  assert.ok(leadScore({ ...base, clicks: 1 }) > leadScore({ ...base, sends: 3 }));
  assert.equal(leadScore({ ...base, touches: 99, sends: 99, opens: 99, clicks: 99, forms: 9, registrations: 9, hasAccount: true, lifecycle: "partner" }), 100);
  assert.equal(leadScore({ ...base, clicks: 2, unsubscribed: true }), 0);
});

test("smart-list filter: words, stage, list, score", () => {
  const p = { values: { name: "Jane Doe", org: "OBIO", email: "j@obio.ca" }, lifecycle: "partner", leadStatus: "new", ownerName: "Ruilin", listIds: ["L1"], score: 40 };
  assert.equal(matchesFilter(p, { q: "jane obio" }), true);
  assert.equal(matchesFilter(p, { q: "mars" }), false);
  assert.equal(matchesFilter(p, { lifecycle: "lead" }), false);
  assert.equal(matchesFilter(p, { listId: "L1", minScore: 30, hasEmail: true }), true);
  assert.equal(matchesFilter(p, { minScore: 50 }), false);
  assert.equal(sanitizeFilter({ lifecycle: "bogus", q: "  " }), null);
  assert.deepEqual(sanitizeFilter({ lifecycle: "lead", minScore: 30.4 }), { lifecycle: "lead", minScore: 30 });
});

test("CSV round-trips quotes, commas, newlines; neutralises formulas", () => {
  const rows = [["a,b", 'say "hi"', "line1\nline2"]];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
  assert.equal(toCsv([["=HYPERLINK(1)"]]), "'=HYPERLINK(1)");
  assert.deepEqual(parseCsv("﻿x,y\r\n1,2\r\n\r\n"), [["x", "y"], ["1", "2"]]);
});

test("CSV import maps headers by label and alias, joins first/last", () => {
  const cols = [{ key: "org", label: "Org" }, { key: "name", label: "Name" }, { key: "email", label: "Email" }];
  const out = csvToPeople("First name,Last name,Company,E-mail,Ignored\nJane,Doe,OBIO,j@obio.ca,x\n,,,,\n", cols);
  assert.deepEqual(out, [{ name: "Jane Doe", org: "OBIO", email: "j@obio.ca" }]);
});

test("tracking tokens verify and reject tampering", () => {
  const t = openToken("send1");
  assert.equal(readOpenToken(t), "send1");
  assert.equal(readOpenToken(t.replace("send1", "send2")), null);
  const sig = clickSig("send1", "https://a.ca/x");
  assert.equal(verifyClick("send1", "https://a.ca/x", sig), true);
  assert.equal(verifyClick("send1", "https://evil.example", sig), false);
});

test("link tracking skips the unsubscribe link; HTML twin escapes and adds pixel", () => {
  const text = "See https://biohubnet.ca/equip. Bye\nunsubscribe: https://x.ca/outreach/unsubscribe/a/b";
  const out = trackLinks(text, (u) => `T(${u})`, (u) => u.includes("/unsubscribe/"));
  assert.match(out, /T\(https:\/\/biohubnet\.ca\/equip\)\. Bye/);
  assert.match(out, /unsubscribe: https:\/\/x\.ca\/outreach\/unsubscribe\/a\/b$/);
  const html = textToHtml("<b>hi</b> https://a.ca/?x=1&y=2", "https://p.ca/px");
  assert.match(html, /&lt;b&gt;hi/);
  assert.match(html, /href="https:\/\/a\.ca\/\?x=1&amp;y=2"/);
  assert.match(html, /<img src="https:\/\/p\.ca\/px"/);
});

test("sequence steps validate and advance to done", () => {
  assert.equal(sanitizeSteps([]), null);
  assert.equal(sanitizeSteps([{ subject: "s", body: "", delayDays: 0 }]), null);
  const steps = sanitizeSteps([{ subject: "a", body: "b", delayDays: 0 }, { subject: "c", body: "d", delayDays: 3 }])!;
  const now = new Date("2026-11-16T00:00:00Z");
  const a = advance(steps, 0, now);
  assert.equal(a.status, "active");
  assert.equal(a.nextDueAt?.toISOString(), "2026-11-19T00:00:00.000Z");
  assert.equal(advance(steps, 1, now).status, "done");
});

test("UTM builder tags http(s) only; pipeline weights by stage", () => {
  assert.equal(buildUtmUrl({ url: "https://biohubnet.ca/e?a=1", source: "LinkedIn", medium: "social", campaign: "Sympo 2026" }),
    "https://biohubnet.ca/e?a=1&utm_source=linkedin&utm_medium=social&utm_campaign=sympo-2026");
  assert.equal(buildUtmUrl({ url: "javascript:alert(1)", source: "a", medium: "b", campaign: "c" }), null);
  assert.deepEqual(pipelineTotals([{ stage: "proposal", amount: 1000 }, { stage: "won", amount: 500 }, { stage: "lost", amount: 900 }]),
    { open: 1000, weighted: 1000, won: 500 });
});

test("form answers yield a name and organisation when the fields exist", async () => {
  const { guessIdentity } = await import("../../src/lib/outreach/crm");
  assert.deepEqual(guessIdentity({ first_name: "Jane", lastName: "Doe", organization: "OBIO", x: 1 }), { name: "Jane Doe", org: "OBIO" });
  assert.deepEqual(guessIdentity({ q1: "yes" }), { name: "", org: "" });
});
