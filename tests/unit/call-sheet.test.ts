/** Call sheet documents validate, and old or partial rows read back whole. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BHN_PROMO_CALL_SHEET, BHN_PROMO_CALL_SHEET_ID, CallSheetInputSchema, blankCallSheet, parseCallSheetData,
} from "../../src/lib/video/call-sheet";

test("the prebuilt BHN Promo sheet is valid and matches the latest migration that writes it", () => {
  const s = CallSheetInputSchema.parse(BHN_PROMO_CALL_SHEET);
  assert.equal(s.shootDate, "2026-10-06");
  assert.equal(s.data.people.filter((p) => p.group === "talent").map((p) => p.name).join(),
    "Molly,Epshita Islam,Yeseul Lee,Roshni,Gilbert,Darius,Yoo Jin", "pillar leads right after Molly");
  assert.ok(s.data.schedule.every((r) => r.end <= "17:00"), "the shoot finishes by 17:00");
  assert.equal(s.data.people.some((p) => p.group === "vendor"), false, "no suppliers on the sheet");
  assert.equal(s.data.equipment, "", "no rental detail on the sheet");
  const dir = path.join(__dirname, "../../prisma/migrations");
  const latest = fs.readdirSync(dir).sort().reverse()
    .map((m) => path.join(dir, m, "migration.sql"))
    .find((f) => fs.existsSync(f) && fs.readFileSync(f, "utf8").includes(`'${BHN_PROMO_CALL_SHEET_ID}'`));
  assert.ok(latest, "a migration writes the sheet");
  const sql = fs.readFileSync(latest!, "utf8");
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
