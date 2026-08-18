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


test("the picker leads with Ontario, Quebec, BC, then the rest by size", () => {
  // Pinned leaders first, then the remainder ranked by how many
  // institutions they hold — so Prairies (8) sits below Quebec (7).
  assert.deepEqual([...REGIONS], [
    "Ontario", "Quebec", "British Columbia", "Prairies", "Atlantic Canada",
  ]);

  const size = (r: string) => INSTITUTIONS.filter((i) => i.region === r).length;
  const rest = REGIONS.slice(3);
  for (let i = 1; i < rest.length; i++) {
    assert.ok(
      size(rest[i - 1]) >= size(rest[i]),
      `${rest[i - 1]} (${size(rest[i - 1])}) should not sit below ${rest[i]} (${size(rest[i])})`,
    );
  }
});

test("grouping follows the picker's region order and drops empty groups", () => {
  const academic = groupedBySector("academic");
  assert.deepEqual(academic.map((g) => g.region), [...REGIONS]);
  const health = groupedBySector("health");
  // No BC, Prairie or Atlantic hospitals on the list, so those groups vanish.
  assert.deepEqual(health.map((g) => g.region), ["Ontario", "Quebec"]);
  assert.equal(health.flatMap((g) => g.names).length, HEALTH_ORGANISATIONS.length);
});

test("each region's list opens with its largest life-science institutions", () => {
  // The ranking inside a region is editorial and expected to be argued
  // with; what must not happen is a later alphabetical re-sort quietly
  // undoing it. Pinning the head of each list catches that.
  const heads = (sector: "academic" | "health") =>
    Object.fromEntries(groupedBySector(sector).map((g) => [g.region, g.names.slice(0, 3)]));

  assert.deepEqual(heads("academic")["Ontario"], [
    "University of Toronto", "McMaster University", "University of Ottawa",
  ]);
  assert.deepEqual(heads("academic")["Quebec"], [
    "Université de Montréal", "McGill University", "Université Laval",
  ]);
  assert.deepEqual(heads("academic")["British Columbia"], [
    "University of British Columbia", "Simon Fraser University", "University of Victoria",
  ]);
  assert.deepEqual(heads("academic")["Prairies"], [
    "University of Alberta", "University of Calgary", "University of Manitoba",
  ]);
  assert.deepEqual(heads("health")["Ontario"], [
    "University Health Network", "Hospital for Sick Children", "Sunnybrook Research Institute",
  ]);

  // Not alphabetical — that is the failure mode this guards against.
  for (const sector of ["academic", "health"] as const) {
    for (const g of groupedBySector(sector)) {
      if (g.names.length < 3) continue;
      const sorted = [...g.names].sort((a, b) => a.localeCompare(b));
      assert.notDeepEqual(g.names, sorted, `${g.region} ${sector} looks alphabetical, not ranked`);
    }
  }
});
