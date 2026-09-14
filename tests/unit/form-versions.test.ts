import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  copyForVersion, copyProblem, nextVersionSlug, versionLabel, versionNumber, versionRoot, versionedTitle,
} from "../../src/lib/formbuilder/versions";
import { parseForm, type BuiltForm } from "../../src/lib/formbuilder/types";
import { REGISTRATION_FORM_SLUGS } from "../../src/lib/allocation/symposium-2026";
import { SITE_THEMED_FORM_SLUGS } from "../../src/lib/formbuilder/site-theme";

const v1 = JSON.parse(
  readFileSync(join(process.cwd(), "tests/unit/fixtures/training-week-v1-live.json"), "utf8"),
) as { slug: string; title: string; description: string | null; fields: Record<string, unknown> };

/* ── slugs ────────────────────────────────────────────────────────── */

test("the first new version of the live registration form is -v2", () => {
  const next = nextVersionSlug(v1.slug, [v1.slug]);
  assert.equal(next, "training-week-registration-2026-v2");
  assert.equal(versionLabel(v1.slug), "v1");
  assert.equal(versionLabel(next), "v2");
});

test("copying a version replaces its suffix rather than stacking another", () => {
  assert.equal(nextVersionSlug("tw-v2", ["tw", "tw-v2"]), "tw-v3");
  assert.equal(versionRoot("tw-v2"), "tw");
});

test("the next version is past the highest, not into a gap", () => {
  // v2 was deleted. A new v2 copied from v3 would read as older than
  // the form it came from.
  assert.equal(nextVersionSlug("tw", ["tw", "tw-v3"]), "tw-v4");
  assert.equal(nextVersionSlug("tw-v3", ["tw", "tw-v3"]), "tw-v4");
});

test("a name that only ends in vN is not a version of a form that does not exist", () => {
  // createForm slugs "Survey v2" as survey-v2. With no survey beside it
  // that is the form's name, not its second version.
  assert.equal(nextVersionSlug("survey-v2", ["survey-v2"]), "survey-v2-v2");
  assert.equal(nextVersionSlug("survey-v2", ["survey-v2", "survey-v2-v2"]), "survey-v2-v3");
  assert.equal(nextVersionSlug("survey-v2-v2", ["survey-v2", "survey-v2-v2"]), "survey-v2-v3");
  assert.equal(nextVersionSlug("tw-v3", ["tw-v3"]), "tw-v3-v2");
  // Once the root exists, the suffix is a version again.
  assert.equal(nextVersionSlug("survey-v2", ["survey", "survey-v2"]), "survey-v3");
  // The badge helpers still read a real chain by its suffix alone.
  assert.equal(versionRoot("training-week-registration-2026-v2"), "training-week-registration-2026");
  assert.equal(versionLabel("training-week-registration-2026-v2"), "v2");
});

test("slugs code has reserved count as taken, so a copy of v1 never lands on the v2 slug", () => {
  // The duplicate action adds these before v2's row exists.
  const taken = [v1.slug, ...REGISTRATION_FORM_SLUGS, ...SITE_THEMED_FORM_SLUGS];
  assert.equal(nextVersionSlug(v1.slug, taken), "training-week-registration-2026-v3");
  assert.equal(nextVersionSlug("training-week-registration-2026-v2", taken), "training-week-registration-2026-v3");
});

test("other forms that only share a prefix are not versions of this one", () => {
  assert.equal(nextVersionSlug("tw", ["tw", "tw-extra-v5", "tw-v2-notes"]), "tw-v2");
});

test("a leading zero or a year is part of the name, not a version", () => {
  assert.equal(versionNumber("thing-v01"), 1);
  assert.equal(versionRoot("report-v2026"), "report-v2026");
  assert.equal(nextVersionSlug("report-v2026", ["report-v2026"]), "report-v2026-v2");
  assert.equal(versionLabel("x-v12"), "v12");
});

test("taken slugs can come as any iterable, and an empty list still names a version", () => {
  assert.equal(nextVersionSlug("tw", new Set(["tw", "tw-v2"])), "tw-v3");
  assert.equal(nextVersionSlug("tw", []), "tw-v2");
});

/* ── titles ───────────────────────────────────────────────────────── */

test("a versioned title carries one marker, however many copies deep", () => {
  assert.equal(versionedTitle("Training Week Registration 2026", 2), "Training Week Registration 2026 (v2)");
  assert.equal(versionedTitle("Training Week Registration 2026 (v2)", 3), "Training Week Registration 2026 (v3)");
  assert.equal(versionedTitle("Training Week Registration 2026 (v2)", 1), "Training Week Registration 2026");
});

test("a versioned title fits the rename box and is never blank", () => {
  const long = versionedTitle("x".repeat(200), 2);
  assert.equal(long.length, 120);
  assert.ok(long.endsWith(" (v2)"));
  assert.equal(versionedTitle("   ", 2), "Untitled form (v2)");
});

/* ── the copied document ──────────────────────────────────────────── */

test("a copy of the live form is exactly what the builder shows for it", () => {
  const copy = copyForVersion(v1.fields);
  assert.ok(copy);
  assert.deepEqual(copy, parseForm(v1.fields));
  assert.equal(copy.fields.length, 14);
  assert.equal(copy.submitNote, parseForm(v1.fields).submitNote);
  assert.equal(copy.presentation, undefined, "v1 has no presentation, and the copy must not invent one");
});

test("presentation and slot capacity carry over; unknown keys do not", () => {
  const raw = structuredClone(v1.fields) as Record<string, unknown> & { fields: Array<Record<string, unknown>> };
  const presentation = { theme: "site", progress: "bar", gateInline: true, intro: ["See [Luma](https://luma.com/wh30nh1n)."] };
  raw.presentation = presentation;
  raw.somethingElse = "dropped";
  const sessions = raw.fields.find((f) => f.key === "sessions") as { slots: Array<Record<string, unknown>> };
  sessions.slots[0].capacity = 30;
  sessions.slots[0].colour = "dropped";

  const copy = copyForVersion(raw) as BuiltForm & Record<string, unknown>;
  assert.deepEqual(copy.presentation, presentation);
  assert.equal("somethingElse" in copy, false);
  const slot = copy.fields.find((f) => f.key === "sessions")!.slots[0] as Record<string, unknown>;
  assert.equal(slot.capacity, 30);
  assert.equal("colour" in slot, false);
});

test("the copy is its own document, not a view of the original", () => {
  const raw = structuredClone(v1.fields) as { fields: Array<{ label: string }> };
  const before = raw.fields[0].label;
  const copy = copyForVersion(raw)!;
  copy.fields[0].label = "changed on the copy";
  assert.equal(raw.fields[0].label, before);
});

test("copying is stable, and an unreadable document copies as an empty form", () => {
  const once = copyForVersion(v1.fields);
  assert.deepEqual(copyForVersion(once), once);
  assert.deepEqual(copyForVersion("not json"), { version: 1, fields: [], sources: [], steps: [] });
});

/* ── refusing a copy that would lose something ────────────────────── */

test("a form that copies whole has no problem, and neither does a blank new form", () => {
  assert.equal(copyProblem(v1.fields, copyForVersion(v1.fields)!), null);
  const blank = { version: 1, fields: [], sources: [], steps: [] };
  assert.equal(copyProblem(blank, copyForVersion(blank)!), null);
});

test("a form from the old editor is refused rather than copied empty", () => {
  const legacy = [{ name: "fullName", label: "Full name", type: "text", required: true }];
  const copy = copyForVersion(legacy)!;
  assert.equal(copy.fields.length, 0, "the old array shape reads as an empty form");
  assert.match(copyProblem(legacy, copy) ?? "", /old form editor/);
  const asText = JSON.stringify(legacy);
  assert.match(copyProblem(asText, copyForVersion(asText)!) ?? "", /old form editor/);
});

test("a question the builder cannot read stops the copy instead of vanishing from it", () => {
  const raw = structuredClone(v1.fields) as { fields: unknown[]; steps: unknown[] };
  raw.fields.push({ key: "broken", type: "no-such-type" });
  const copy = copyForVersion(raw)!;
  assert.equal(copy.fields.length, 14);
  assert.equal(
    copyProblem(raw, copy),
    "This form was not copied: 1 question on it could not be read and would be missing from the copy.",
  );
  raw.steps.push("not a step", 7);
  assert.match(copyProblem(raw, copyForVersion(raw)!) ?? "", /1 question, 2 workflow steps on it/);
});
