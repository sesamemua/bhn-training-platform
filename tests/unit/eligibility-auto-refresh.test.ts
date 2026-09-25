/** Which list can refresh itself, and when it stays inert. */
import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_SOURCE_ID, autoRefreshes, REFRESH_COOLDOWN_MS } from "../../src/lib/eligibility/apply";
import { ELIGIBILITY_SOURCES } from "../../src/lib/eligibility/sources";

const withEnv = (value: string | undefined, run: () => void) => {
  const before = process.env.ELIGIBILITY_SHEET_CSV;
  if (value === undefined) delete process.env.ELIGIBILITY_SHEET_CSV;
  else process.env.ELIGIBILITY_SHEET_CSV = value;
  try { run(); } finally {
    if (before === undefined) delete process.env.ELIGIBILITY_SHEET_CSV;
    else process.env.ELIGIBILITY_SHEET_CSV = before;
  }
};

test("nothing refreshes itself until a sheet link is configured", () => {
  withEnv(undefined, () => {
    for (const s of ELIGIBILITY_SOURCES) assert.equal(autoRefreshes(s.id), false, s.id);
  });
});

test("with a link, only the one readable list refreshes itself", () => {
  withEnv("https://docs.google.com/spreadsheets/d/x/export?format=csv", () => {
    assert.equal(autoRefreshes(AUTO_SOURCE_ID), true);
    // SharePoint needs credentials nobody here can issue; the platform
    // list is read live and never imported at all.
    for (const s of ELIGIBILITY_SOURCES.filter((x) => x.id !== AUTO_SOURCE_ID)) {
      assert.equal(autoRefreshes(s.id), false, s.id);
    }
  });
});

test("the sheet is read at most once every ten minutes, however many people miss", () => {
  assert.equal(REFRESH_COOLDOWN_MS, 10 * 60_000);
});
