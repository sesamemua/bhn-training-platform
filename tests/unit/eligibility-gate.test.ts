import test from "node:test";
import assert from "node:assert/strict";
import { eligibilityGate, STALE_AFTER_HOURS } from "../../src/lib/eligibility/gate";
import { ELIGIBILITY_SOURCES, eligibilitySource } from "../../src/lib/eligibility/sources";
import { listUpdatedSentence, NOT_ON_LIST_MESSAGE } from "../../src/lib/eligibility/messages";

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

test("the lists the organisers named are registered, plus the live one", () => {
  assert.equal(ELIGIBILITY_SOURCES.length, 4);
  for (const id of ["engage-experience", "equip-venture-connect", "equip-venturelift", "equip-application-form"]) {
    assert.ok(eligibilitySource(id), `${id} is missing`);
  }
  assert.equal(eligibilitySource("no-such-list"), null);
});

test("every source says where it lives and what it makes you eligible for", () => {
  for (const s of ELIGIBILITY_SOURCES) {
    // An exported list lives somewhere else; the live one lives here,
    // so its "source" is the page an admin reads it on.
    const here = s.access === "platform";
    assert.ok(here ? s.url.startsWith("/") : s.url.startsWith("https://"), `${s.id} has no usable URL`);
    assert.ok(s.programmes.length > 0, `${s.id} grants no programme`);
    assert.ok(s.note.trim().length > 10, `${s.id} has no explanation`);
    assert.ok(["manual", "google", "graph", "platform"].includes(s.access));
  }
});

test("only one list is read live — the rest are imports that can go stale", () => {
  // The gate counts imported rows. A second live list would need the
  // same care taken over the first: counted where it lives, no Import
  // button, and excluded from the add-by-hand picker.
  assert.deepEqual(
    ELIGIBILITY_SOURCES.filter((s) => s.access === "platform").map((s) => s.id),
    ["equip-application-form"],
  );
});

test("between them the sources cover ENGAGE, EXPERIENCE and EQUIP", () => {
  const all = new Set(ELIGIBILITY_SOURCES.flatMap((s) => s.programmes));
  for (const p of ["ENGAGE", "EXPERIENCE", "EQUIP"]) assert.ok(all.has(p), `${p} has no list`);
});

/* ── What the registrant is told ─────────────────────────────────── */

test("the message never names which list they are missing from", () => {
  // Naming it would turn the form into a way to find out who applied
  // to EQUIP by typing addresses at it.
  const msg = NOT_ON_LIST_MESSAGE.toLowerCase();
  for (const leak of ["engage", "experience", "equip", "venture", "sharepoint", "google", "sheet"]) {
    assert.ok(!msg.includes(leak), `the message mentions ${leak}`);
  }
});

test("the message says they can carry on, and who settles it", () => {
  // A dead end with no next step is how a real applicant gives up —
  // and this one is not even a dead end any more.
  assert.match(NOT_ON_LIST_MESSAGE, /carry on and register/i);
  assert.match(NOT_ON_LIST_MESSAGE, /coordinator/i);
  assert.doesNotMatch(NOT_ON_LIST_MESSAGE, /cannot register|not eligible|stops here/i);
});

test("the dated sentence puts the lists' age in front of the person reading it", () => {
  const said = listUpdatedSentence("2026-09-22T21:01:34.291Z");
  assert.ok(said);
  // Toronto, where the week is: 21:01 UTC is 17:01 the same day.
  assert.match(said, /September 22, 2026/);
  assert.match(said, /5:01/);
  assert.match(said, /ENGAGE or EXPERIENCE/);
  assert.match(said, /EQUIP application/);
  // Nothing imported, nothing enforced — a date would only confuse.
  assert.equal(listUpdatedSentence(null), null);
  assert.equal(listUpdatedSentence("not a date"), null);
});
