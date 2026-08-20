import test from "node:test";
import assert from "node:assert/strict";
import { allHold, holds, missing, optionsFor, problems, visibleFields, walk } from "../../src/lib/formbuilder/logic";
import { parseForm, keyFor, type BuiltForm } from "../../src/lib/formbuilder/types";
import { parseCsv as parseCsvFn } from "../../src/lib/formbuilder/csv";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";

const form = (over: Partial<BuiltForm> = {}): BuiltForm =>
  ({ version: 1, fields: [], sources: [], steps: [], ...over }) as BuiltForm;

const field = (key: string, over: Record<string, unknown> = {}) =>
  ({ id: key, key, label: key, type: "short_text", required: false, options: [],
     showWhen: [], slots: [], stage: "registration", ...over }) as never;

test("a condition reads the answers, and unanswered is not the same as 'not X'", () => {
  assert.equal(holds({ field: "a", op: "is", value: "Yes" }, { a: "Yes" }), true);
  assert.equal(holds({ field: "a", op: "is", value: "Yes" }, { a: "No" }), false);
  // The trap: a blank must not satisfy a negative, or fields appear for
  // people who simply have not got there yet.
  assert.equal(holds({ field: "a", op: "is not", value: "Yes" }, {}), false);
  assert.equal(holds({ field: "a", op: "is not", value: "Yes" }, { a: "No" }), true);
  assert.equal(holds({ field: "a", op: "answered" }, { a: "x" }), true);
  assert.equal(holds({ field: "a", op: "empty" }, {}), true);
  assert.equal(holds({ field: "a", op: "any of", value: "x, y" }, { a: ["y"] }), true);
  assert.equal(holds({ field: "a", op: "greater than", value: "5" }, { a: "9" }), true);
  assert.equal(holds({ field: "a", op: "greater than", value: "5" }, { a: "not a number" }), false);
});

test("no conditions means always", () => {
  assert.equal(allHold([], {}), true);
});

test("fields appear and disappear as the answers change", () => {
  const f = form({
    fields: [
      field("trainee", { type: "yesno", required: true }),
      field("programme", { showWhen: [{ field: "trainee", op: "is", value: "Yes" }] }),
    ],
  });
  assert.deepEqual(visibleFields(f, {}).map((x) => x.key), ["trainee"]);
  assert.deepEqual(visibleFields(f, { trainee: "Yes" }).map((x) => x.key), ["trainee", "programme"]);
  assert.deepEqual(visibleFields(f, { trainee: "No" }).map((x) => x.key), ["trainee"]);
});

test("only visible required fields count as missing", () => {
  const f = form({
    fields: [
      field("trainee", { type: "yesno", required: true }),
      field("programme", { required: true, showWhen: [{ field: "trainee", op: "is", value: "Yes" }] }),
    ],
  });
  assert.deepEqual(missing(f, {}).map((x) => x.key), ["trainee"]);
  assert.deepEqual(missing(f, { trainee: "Yes" }).map((x) => x.key), ["programme"]);
  assert.deepEqual(missing(f, { trainee: "No" }).map((x) => x.key), []);
});

test("a lookup field draws its options from the named sheet column", () => {
  const f = form({
    sources: [{
      id: "s1", label: "Institutions", url: "https://example", columns: ["Name", "Region"],
      valueColumn: "Name", rows: [["UofT", "Ontario"], ["McGill", "Quebec"]],
    } as never],
    fields: [field("inst", { type: "lookup", sourceId: "s1" })],
  });
  assert.deepEqual(optionsFor(f, f.fields[0]), ["UofT", "McGill"]);
});

test("the workflow walk follows the answers and reports the branch taken", () => {
  const f = form({
    fields: [field("trainee", { type: "yesno" })],
    steps: [
      { id: "s", kind: "start", label: "Applied", when: [], next: "c" },
      { id: "c", kind: "check", label: "Trainee?", when: [{ field: "trainee", op: "is", value: "Yes" }], next: "fast", otherwise: "slow" },
      { id: "fast", kind: "end", label: "Priority", when: [] },
      { id: "slow", kind: "end", label: "Standard", when: [] },
    ] as never,
  });
  assert.deepEqual(walk(f, { trainee: "Yes" }).map((r) => r.step.id), ["s", "c", "fast"]);
  assert.deepEqual(walk(f, { trainee: "No" }).map((r) => r.step.id), ["s", "c", "slow"]);
  assert.equal(walk(f, { trainee: "Yes" })[2].via, "yes");
});

test("a workflow that loops does not hang the editor", () => {
  const f = form({
    steps: [
      { id: "a", kind: "start", label: "A", when: [], next: "b" },
      { id: "b", kind: "action", label: "B", when: [], next: "a" },
    ] as never,
  });
  assert.deepEqual(walk(f, {}).map((r) => r.step.id), ["a", "b"]);
});

test("problems name what is wrong, in the words of the thing that is wrong", () => {
  const f = form({
    fields: [
      field("a", { showWhen: [{ field: "ghost", op: "is", value: "x" }] }),
      field("b", { type: "choice" }),
      field("c", { type: "lookup" }),
      field("a2", { key: "a" }),
    ],
    steps: [
      { id: "s", kind: "check", label: "Check", when: [{ field: "missing_key", op: "is", value: "1" }], next: "nowhere" },
    ] as never,
  });
  const found = problems(f).map((p) => p.what).join(" | ");
  assert.match(found, /no question has that key/i);
  assert.match(found, /nothing to choose from/i);
  assert.match(found, /no sheet is chosen/i);
  assert.match(found, /share the key/i);
  assert.match(found, /no longer exists/i);
  assert.match(found, /has no starting step/i);
});

test("a field that depends on a LATER question can never show, and says so", () => {
  const f = form({
    fields: [
      field("early", { showWhen: [{ field: "late", op: "is", value: "Yes" }] }),
      field("late", { type: "yesno" }),
    ],
  });
  assert.match(problems(f).map((p) => p.what).join(" "), /asked later — so it can never show/i);
});

test("a clean form reports no problems", () => {
  const f = form({
    fields: [field("trainee", { type: "yesno" }), field("note", { showWhen: [{ field: "trainee", op: "is", value: "Yes" }] })],
    steps: [
      { id: "s", kind: "start", label: "Start", when: [], next: "e" },
      { id: "e", kind: "end", label: "Done", when: [] },
    ] as never,
  });
  assert.deepEqual(problems(f), []);
});

test("a corrupt stored document opens as an empty form rather than throwing", () => {
  assert.deepEqual(parseForm("not json").fields, []);
  assert.deepEqual(parseForm(null).fields, []);
  assert.deepEqual(parseForm({ fields: [{ nonsense: true }, { id: "a", key: "a", label: "A", type: "email" }] }).fields.length, 1);
});

test("keys are derived from labels and never collide", () => {
  assert.equal(keyFor("Your affiliations", []), "your_affiliations");
  assert.equal(keyFor("Your affiliations", ["your_affiliations"]), "your_affiliations_2");
  assert.equal(keyFor("!!!", []), "field");
});

test("CSV keeps a comma that lives inside a quoted cell", () => {
  const rows = parseCsvFn('Name,Region\n"University of Toronto, Mississauga",Ontario\nMcGill,Quebec\n');
  assert.deepEqual(rows, [
    ["Name", "Region"],
    ["University of Toronto, Mississauga", "Ontario"],
    ["McGill", "Quebec"],
  ]);
});

test("CSV survives escaped quotes and blank lines", () => {
  const rows = parseCsvFn('A\n"say ""hi"""\n\nB\n');
  assert.deepEqual(rows, [["A"], ['say "hi"'], ["B"]]);
});

test("every question in the shipped Training Week form survives being parsed", () => {
  // parseForm drops a field it cannot validate, silently and by design.
  // That is right for a corrupt blob and lethal for a field this repo
  // ships: a help string over the cap once removed the whole photography
  // consent question, and the only symptom was a count going down by one.
  const parsed = parseForm(TRAINING_WEEK_FORM as unknown);
  assert.equal(parsed.fields.length, TRAINING_WEEK_FORM.fields.length,
    "a question was dropped by validation");
  assert.equal(parsed.steps.length, TRAINING_WEEK_FORM.steps.length);
  const consent = parsed.fields.find((f) => f.key === "media_consent")!;
  assert.equal(consent.type, "consent", "one box to tick, not a yes/no pair");
  assert.equal(consent.required, true, "ticking it is required to register");
});

test("a confirmation question is not on the registration form", () => {
  const f = form({
    fields: [
      field("name"),
      field("confirmed", { type: "yesno", required: true, stage: "confirmation" }),
    ],
  });
  assert.deepEqual(visibleFields(f, {}).map((x) => x.key), ["name"], "registration by default");
  assert.deepEqual(visibleFields(f, {}, "confirmation").map((x) => x.key), ["confirmed"]);
});

test("a required confirmation question does not block the registration form", () => {
  // Otherwise somebody signing up is told they have not answered a
  // question that will not be put to them for another three weeks.
  const f = form({
    fields: [
      field("name", { required: true }),
      field("confirmed", { type: "yesno", required: true, stage: "confirmation" }),
    ],
  });
  assert.deepEqual(missing(f, {}).map((x) => x.key), ["name"]);
  assert.deepEqual(missing(f, { name: "x" }).map((x) => x.key), []);
  assert.deepEqual(missing(f, { name: "x" }, "confirmation").map((x) => x.key), ["confirmed"]);
});

test("the shipped form asks 'Can you still make it?' only after approval", () => {
  const conf = TRAINING_WEEK_FORM.fields.find((f) => f.key === "confirmed")!;
  assert.equal(conf.stage, "confirmation");
  const onForm = visibleFields(TRAINING_WEEK_FORM, {}).map((f) => f.key);
  assert.ok(!onForm.includes("confirmed"), "it must not appear while registering");
  // And the workflow still reads it, from the step that sends the email.
  assert.ok(TRAINING_WEEK_FORM.steps.some((s) => s.when.some((c) => c.field === "confirmed")));
});
