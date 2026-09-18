/** Call sheet documents validate, and old or partial rows read back whole. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BHN_PROMO_CALL_SHEET, BHN_PROMO_CALL_SHEET_ID, CallSheetInputSchema, blankCallSheet, parseCallSheetData,
} from "../../src/lib/video/call-sheet";

test("the prebuilt BHN Promo sheet is valid and matches the seed migration", () => {
  const s = CallSheetInputSchema.parse(BHN_PROMO_CALL_SHEET);
  assert.equal(s.shootDate, "2026-10-06");
  assert.equal(s.data.people.filter((p) => p.group === "talent").map((p) => p.name).join(), "Molly,Gilbert,Darius");
  const sql = fs.readFileSync(path.join(__dirname, "../../prisma/migrations/20261007000000_call_sheets/migration.sql"), "utf8");
  assert.ok(sql.includes(`'${BHN_PROMO_CALL_SHEET_ID}'`));
  const json = sql.match(/'(\{"production"[\s\S]*\})'::jsonb/)?.[1]?.replace(/''/g, "'");
  assert.ok(json, "seed JSON present");
  assert.deepEqual(JSON.parse(json!), s.data, "migration seeds exactly the sheet in code");
});

test("a blank sheet validates; a title is required", () => {
  assert.ok(CallSheetInputSchema.safeParse(blankCallSheet()).success);
  assert.equal(CallSheetInputSchema.safeParse({ ...blankCallSheet(), title: "  " }).success, false);
  assert.equal(CallSheetInputSchema.safeParse({ ...blankCallSheet(), shootDate: "6 Oct" }).success, false);
});

test("stored data with missing or junk fields reads back complete", () => {
  const d = parseCallSheetData({ production: "X", people: [{ name: "A" }] });
  assert.equal(d.production, "X");
  assert.equal(d.people[0].group, "crew");
  assert.equal(d.schedule.length, 0);
  assert.equal(parseCallSheetData(null).people.length, 0);
  assert.equal(parseCallSheetData({ people: "nope" }).people.length, 0, "unreadable → empty, not a crash");
});
