import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTITUTIONS, VENTURE_LIFT_INSTITUTIONS, institutionsForStream,
  isEligibleForStream, findInstitution, institutionLabel,
} from "../../src/lib/equip/institutions";

/**
 * biohubnet.ca/equip states the two streams' reach plainly:
 *   VentureConnect — all 41 partner institutions, to January 2027
 *   VentureLift    — 14 participating Ontario partners, to March 2028
 * The list used to hold only the 14 and serve both, so an applicant
 * from any of the other 27 could not find themselves in the picker.
 */

test("all 41 partner institutions are here", () => {
  assert.equal(INSTITUTIONS.length, 41);
});

test("VentureConnect reaches all of them; VentureLift reaches fourteen", () => {
  assert.equal(institutionsForStream("venture_connect").length, 41);
  assert.equal(institutionsForStream("venture_lift").length, 14);
  assert.equal(VENTURE_LIFT_INSTITUTIONS.length, 14);
});

test("THE TRAP: Ontario is not the fourteen", () => {
  // Six Ontario partners are not VentureLift participants, which is why
  // the notice can never be phrased as an out-of-province rule.
  const ontario = INSTITUTIONS.filter((i) => i.region === "Ontario");
  assert.ok(ontario.length > 14, `Ontario has ${ontario.length}, so it is not the roster`);
  const ontarioNotLift = ontario.filter((i) => i.tier !== "current");
  assert.ok(ontarioNotLift.length > 0,
    "if every Ontario partner were eligible the notice could say 'Ontario only' — it cannot");
  // And every VentureLift institution IS in Ontario.
  for (const i of VENTURE_LIFT_INSTITUTIONS) {
    assert.equal(i.region, "Ontario", `${i.name} is on the VentureLift roster but not in Ontario`);
  }
});

test("slugs are unique and stable-looking", () => {
  const slugs = INSTITUTIONS.map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length, "a duplicate slug would make one unreachable");
  for (const s of slugs) {
    assert.match(s, /^[a-z0-9-]+$/, `${s} is not a safe slug`);
  }
});

test("no institution is named 'other' — the picker appends that itself", () => {
  assert.equal(findInstitution("other"), null);
  assert.equal(institutionLabel("other", "Somewhere Else"), "Somewhere Else");
});

test("eligibility is per stream, not global", () => {
  const lift = VENTURE_LIFT_INSTITUTIONS[0];
  const notLift = INSTITUTIONS.find((i) => i.tier !== "current")!;
  assert.equal(isEligibleForStream(lift.slug, "venture_lift"), true);
  assert.equal(isEligibleForStream(lift.slug, "venture_connect"), true);
  assert.equal(isEligibleForStream(notLift.slug, "venture_lift"), false);
  assert.equal(isEligibleForStream(notLift.slug, "venture_connect"), true,
    "VentureConnect is open to all 41 — refusing anyone here is the old bug");
});

test("an unknown slug does not crash the label", () => {
  assert.equal(findInstitution(null), null);
  assert.equal(findInstitution("nope"), null);
  assert.ok(typeof institutionLabel("nope", null) === "string");
});

test("names carry their real accents and apostrophes", () => {
  // Generated from the published roster rather than transcribed, so a
  // mangled name here means somebody retyped one.
  const joined = INSTITUTIONS.map((i) => i.name).join(" ");
  assert.ok(!joined.includes("?"), "a replacement character means an encoding was lost");
  assert.ok(!/[‘’]/.test(joined), "apostrophes should be ASCII U+0027, as published");
});
