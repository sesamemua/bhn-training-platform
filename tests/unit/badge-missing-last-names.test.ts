import assert from "node:assert/strict";
import test from "node:test";
import { applyPrintAction, incompleteName, mergePrintGuests, PrintBoardSchema, printPeople, type PrintBoard } from "../../src/lib/events/print-jobs";

test("missing last names includes blank names, single words and surname initials, not complete names", () => {
  for (const name of ["", "Echo", " Li ", "Sara H", "Sara H."]) assert.equal(incompleteName(name), true, name);
  for (const name of ["Sara Haghighat", "KJ Aitken", "Élodie Lévesque", "Jane O'Neill", "Jean-Luc Picard"]) assert.equal(incompleteName(name), false, name);
});

test("the list checks the current badge name, including reviewed entries, not an already corrected source name", () => {
  const board: PrintBoard = {
    guests: [
      { id: "resolved", name: "Alice", email: "alice@example.org", organization: "Example", status: "approved", tickets: 1, source: "luma", badgeRole: "" },
      { id: "reviewed", name: "Echo", email: "echo@example.org", organization: "Example", status: "approved", tickets: 1, source: "luma", badgeRole: "" },
    ],
    edits: { reviewed: { name: "Echo", organization: "Example", extra: "", reviewed: true } },
    jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null,
  };
  const people = printPeople(board, [{ fullName: "Alice Feng", email: "alice@example.org", organization: "Example", title: "" }]);
  assert.deepEqual(people.filter(p => incompleteName(p.name)).map(p => p.id), ["reviewed"]);
  assert.equal(people.find(p => p.id === "resolved")!.sourceName, "Alice");
  assert.deepEqual(people.find(p => p.id === "reviewed")!.issues, []);
});

test("a confirmed single name survives validation and Luma sync without suppressing other checks", () => {
  const board: PrintBoard = {
    guests: [{ id: "reema", name: "Reema", email: "reema@example.org", organization: "", status: "approved", tickets: 1, source: "luma", badgeRole: "" }],
    edits: {}, jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null,
  };
  const changed = applyPrintAction(board, printPeople(board), { action: "edit", id: "reema", badge: { name: "Reema", organization: "", extra: "", reviewed: false, singleName: true } }, "Admin", "unused", "2026-10-21T16:00:00Z").board;
  const synced = PrintBoardSchema.parse(mergePrintGuests(changed, [{ ...board.guests[0], organization: "York University" }], "2026-10-21T16:01:00Z"));
  const [person] = printPeople(synced);
  assert.equal(person.name, "Reema");
  assert.equal(person.singleName, true);
  assert.equal(incompleteName(person.name) && !person.singleName, false);
  assert.ok(!person.issues.includes("Check incomplete name / surname"));
  assert.ok(person.issues.includes("Organization missing"));
  assert.equal(synced.guests[0].name, "Reema");
  const reset = applyPrintAction(synced, [person], { action: "edit", id: "reema", badge: { ...synced.edits.reema, singleName: false } }, "Admin", "unused", "2026-10-21T16:02:00Z").board;
  assert.ok(printPeople(reset)[0].issues.includes("Check incomplete name / surname"));
});
