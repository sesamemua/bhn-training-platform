import assert from "node:assert/strict";
import test from "node:test";
import { incompleteName, printPeople, type PrintBoard } from "../../src/lib/events/print-jobs";

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
