import test from "node:test";
import assert from "node:assert/strict";
import { eligibilityGate, STALE_AFTER_HOURS } from "../../src/lib/eligibility/gate";
import { ELIGIBILITY_SOURCES, eligibilitySource } from "../../src/lib/eligibility/sources";
import { BLOCKED_MESSAGE } from "../../src/lib/eligibility/messages";

const NOW = new Date("2026-09-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

/**
 * The interlock. Registration blocks on a non-match, so the one thing
 * that must never happen is blocking against a list nobody loaded —
 * that refuses every applicant on the planet, silently, on the morning
 * registration opens.
 */

test("an empty roster never turns anybody away", () => {
  const g = eligibilityGate({ total: 0, lastImportAt: null }, NOW);
  assert.equal(g.enforcing, false);
  assert.match(g.reason, /nobody is being turned away/);
});

test("an empty roster is not enforcing even if an import once ran", () => {
  // An import that read a file and produced no rows is the same danger.
  const g = eligibilityGate({ total: 0, lastImportAt: hoursAgo(1) }, NOW);
  assert.equal(g.enforcing, false);
});

test("a loaded roster enforces", () => {
  const g = eligibilityGate({ total: 340, lastImportAt: hoursAgo(2) }, NOW);
  assert.equal(g.enforcing, true);
  assert.equal(g.stale, false);
  assert.match(g.reason, /340 people/);
});

test("a stale roster still enforces, and says so", () => {
  // A stale list turns away fewer people than no list. Warn, do not stop.
  const g = eligibilityGate({ total: 340, lastImportAt: hoursAgo(STALE_AFTER_HOURS + 1) }, NOW);
  assert.equal(g.enforcing, true);
  assert.equal(g.stale, true);
  assert.match(g.reason, /more than 72 hours old/);
  assert.match(g.reason, /accepted since then will be refused/);
});

test("rows with no import date are treated as stale, not as fresh", () => {
  const g = eligibilityGate({ total: 12, lastImportAt: null }, NOW);
  assert.equal(g.enforcing, true);
  assert.equal(g.stale, true);
});

test("the boundary is not off by an hour", () => {
  assert.equal(eligibilityGate({ total: 5, lastImportAt: hoursAgo(STALE_AFTER_HOURS - 1) }, NOW).stale, false);
  assert.equal(eligibilityGate({ total: 5, lastImportAt: hoursAgo(STALE_AFTER_HOURS + 1) }, NOW).stale, true);
});

/* ── The register ────────────────────────────────────────────────── */

test("all three lists the organisers named are registered", () => {
  assert.equal(ELIGIBILITY_SOURCES.length, 3);
  for (const id of ["engage-experience", "equip-venture-connect", "equip-venturelift"]) {
    assert.ok(eligibilitySource(id), `${id} is missing`);
  }
  assert.equal(eligibilitySource("no-such-list"), null);
});

test("every source says where it lives and what it makes you eligible for", () => {
  for (const s of ELIGIBILITY_SOURCES) {
    assert.ok(s.url.startsWith("https://"), `${s.id} has no usable URL`);
    assert.ok(s.programmes.length > 0, `${s.id} grants no programme`);
    assert.ok(s.note.trim().length > 10, `${s.id} has no explanation`);
    assert.ok(["manual", "google", "graph"].includes(s.access));
  }
});

test("between them the sources cover ENGAGE, EXPERIENCE and EQUIP", () => {
  const all = new Set(ELIGIBILITY_SOURCES.flatMap((s) => s.programmes));
  for (const p of ["ENGAGE", "EXPERIENCE", "EQUIP"]) assert.ok(all.has(p), `${p} has no list`);
});

/* ── What the registrant is told ─────────────────────────────────── */

test("the refusal never names which list they are missing from", () => {
  // Naming it would turn the form into a way to find out who applied
  // to EQUIP by typing addresses at it.
  const msg = BLOCKED_MESSAGE.toLowerCase();
  for (const leak of ["engage", "experience", "equip", "venture", "sharepoint", "google", "sheet"]) {
    assert.ok(!msg.includes(leak), `the refusal mentions ${leak}`);
  }
});

test("the refusal tells them what to do about it", () => {
  // A dead end with no next step is how a real applicant gives up.
  assert.match(BLOCKED_MESSAGE, /coordinator/i);
  assert.match(BLOCKED_MESSAGE, /different email|just been accepted/i);
  assert.match(BLOCKED_MESSAGE, /nothing you have typed here is lost/i);
});
