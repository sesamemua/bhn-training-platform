import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_INSTITUTIONS,
  HEALTH_ORGANISATIONS,
  INSTITUTIONS,
  REGIONS,
  findInstitution,
  groupedBySector,
} from "../../src/lib/flowchart/institutions";

test("all 41 institutions are present", () => {
  assert.equal(INSTITUTIONS.length, 41);
});

test("the regional counts match the published breakdown", () => {
  const counts = Object.fromEntries(
    REGIONS.map((r) => [r, INSTITUTIONS.filter((i) => i.region === r).length]),
  );
  assert.deepEqual(counts, {
    "British Columbia": 4,
    Prairies: 8,
    Ontario: 20,
    Quebec: 7,
    "Atlantic Canada": 2,
  });
});

test("no institution is listed twice", () => {
  const names = INSTITUTIONS.map((i) => i.name);
  assert.equal(new Set(names).size, names.length);
});

test("academic and health lists partition the whole set", () => {
  assert.equal(ACADEMIC_INSTITUTIONS.length + HEALTH_ORGANISATIONS.length, 41);
  for (const n of HEALTH_ORGANISATIONS) {
    assert.ok(!ACADEMIC_INSTITUTIONS.includes(n), `${n} is in both lists`);
  }
});

test("hospitals are classified as health, universities as academic", () => {
  for (const n of ["Hospital for Sick Children", "Unity Health Toronto", "University Health Network",
                   "The Ottawa Hospital", "Centre hospitalier Universitaire Sainte-Justine"]) {
    assert.equal(findInstitution(n)?.sector, "health", `${n} should be health`);
  }
  for (const n of ["University of Toronto", "McGill University", "Seneca Polytechnic"]) {
    assert.equal(findInstitution(n)?.sector, "academic", `${n} should be academic`);
  }
});


test("grouping preserves the published region order and drops empty groups", () => {
  const academic = groupedBySector("academic");
  assert.deepEqual(academic.map((g) => g.region), [...REGIONS]);
  const health = groupedBySector("health");
  // No BC, Prairie or Atlantic hospitals on the list, so those groups vanish.
  assert.deepEqual(health.map((g) => g.region), ["Ontario", "Quebec"]);
  assert.equal(health.flatMap((g) => g.names).length, HEALTH_ORGANISATIONS.length);
});
