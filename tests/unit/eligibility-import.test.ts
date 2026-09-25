/** Roster import: every address, and a name only from a column headed as one. */
import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeSignInPage, parseRoster } from "../../src/lib/eligibility/import";

test("the institution is never taken as the name (the Hospital for Sick Children bug)", () => {
  const sheet = [
    "Institution,Email,Name",
    "Hospital for Sick Children,ruilin.yuan@utoronto.ca,Ruilin Yuan",
    "University of Toronto,ana@utoronto.ca,Ana Diaz",
  ].join("\n");
  const { rows } = parseRoster(sheet);
  assert.deepEqual(rows.map((r) => r.name), ["Ruilin Yuan", "Ana Diaz"]);
});

test("first + last name columns are joined; an 'Institution name' column is not a person", () => {
  const sheet = "Institution Name\tFirst Name\tLast Name\tE-mail\nSickKids\tRuilin\tYuan\truilin.yuan@utoronto.ca";
  assert.equal(parseRoster(sheet).rows[0].name, "Ruilin Yuan");
});

test("no name header, no guess: the name is left blank", () => {
  const { rows, skipped } = parseRoster("Hospital for Sick Children,ruilin.yuan@utoronto.ca\nno address here");
  assert.equal(rows[0].name, null);
  assert.equal(rows[0].emailKey, "ruilin.yuan@utoronto.ca");
  assert.equal(skipped, 1);
});

test("duplicates collapse, quotes are stripped", () => {
  const { rows } = parseRoster('Name,Email\n"Ana Diaz","ana@utoronto.ca"\nAna D,ANA@utoronto.ca');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Ana Diaz");
});

test("a sign-in page is not mistaken for a sheet", () => {
  assert.equal(looksLikeSignInPage('<!DOCTYPE html><html><head><title>Sign in'), true);
  assert.equal(looksLikeSignInPage("\n  <html lang=\"en\">"), true);
  assert.equal(looksLikeSignInPage("Name,Email\nAna Diaz,ana@utoronto.ca"), false);
  // A sheet whose first cell happens to hold a tag is still a sheet.
  assert.equal(looksLikeSignInPage("Name,Email\n<b>Ana</b>,ana@utoronto.ca"), false);
});
