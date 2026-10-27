import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BadgeAttention } from "../../src/components/admin/events/SymposiumPrintJobs";
import { applyPrintAction, attentionItems, mergePrintGuests, printPeople, type PrintBoard, type PrintPerson } from "../../src/lib/events/print-jobs";

const person = (over: Partial<PrintPerson> = {}): PrintPerson => ({
  id: "guest-1", name: "Echo", email: "echo.jing@example.org", organization: "University of Toronto", position: "PhD student",
  extra: "HQP Representative", sourceName: "ECHO", sourceOrganization: "UofT", status: "approved", source: "luma", tickets: 1,
  issues: ["Check incomplete name / surname"], suggestion: "Echo Jing", printStatus: "unprinted", ...over,
});
const render = (people: PrintPerson[], busy = false) => renderToStaticMarkup(createElement(BadgeAttention, { people, busy, onOpen: () => {}, onApprove: () => {}, onReprint: () => {} }));

test("attention rows show identity, contact, role, status and original name without opening a badge", () => {
  const html = render([person()]);
  for (const value of ["Echo", "echo.jing@example.org", "University of Toronto", "PhD student", "HQP Representative", "ECHO", "Check incomplete name / surname"]) assert.ok(html.includes(value), value);
  for (const label of ["Email:", "Organization:", "Current role:", "Print status:", "Registration status:", "Original registration name:", "Badge line:"]) assert.ok(html.includes(label), label);
  assert.match(html, /aria-label="Fix badge for Echo"/);
  assert.match(html, /aria-label="Approve badge as is for Echo"/);
  assert.doesNotMatch(html, /<dd[^>]*>Echo Jing<\/dd>/, "an unverified email suggestion is not presented as the registrant's name");
});

test("extra-ticket items distinguish total tickets from unnamed additional guests", () => {
  const html = render([person({ name: "Bonny Wu", sourceName: "Bonny", tickets: 12, issues: ["12 tickets: additional guests need individual names"] })]);
  assert.match(html, /11 additional guests need a name/);
  assert.match(html, /Tickets: <\/dt><dd[^>]*>12<\/dd>/);
  assert.match(html, /Unnamed guests: <\/dt><dd[^>]*>11<\/dd>/);
  assert.match(html, /aria-label="Review for Bonny Wu"/);
  assert.doesNotMatch(html, /Approve as is/);
});

test("missing information is explicit, text is escaped, and busy controls remain disabled", () => {
  const html = render([person({ name: "<Guest>", email: "", organization: "", position: "", extra: "", sourceName: "<Guest>" })], true);
  assert.equal((html.match(/Not supplied/g) ?? []).length, 3);
  assert.match(html, /&lt;Guest&gt;/);
  assert.doesNotMatch(html, /<Guest>|Original registration name:|Badge line:/);
  assert.match(html, /disabled=""/);
});

test("reprint and cancelled-registration actions retain their distinct groups and empty state", () => {
  const html = render([
    person({ id: "reprint", name: "Ada Lovelace", issues: [], printStatus: "changed" }),
    person({ id: "left", name: "Grace Hopper", issues: [], status: "cancelled", printStatus: "printed" }),
  ]);
  assert.match(html, /Changed since it was printed/);
  assert.match(html, /aria-label="Add to reprint for Ada Lovelace"/);
  assert.match(html, /no longer registered/);
  assert.match(html, /aria-label="Review for Grace Hopper"/);
  assert.doesNotMatch(html, /Approve as is/);
  assert.match(render([]), /Nothing needs attention/);
});

test("approval cannot accept a blank name, unsupported font characters or an overlong line", () => {
  for (const entry of [person({ name: "" }), person({ issues: ["Check font support for this badge"] }), person({ issues: ["Title / role is too long for one line. Shorten it before printing."] })]) {
    const html = render([entry]);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Approve badge as is for/);
  }
});

test("placeholder titles are flagged without rewriting registrations and explicit review remains available", () => {
  const board: PrintBoard = {
    guests: [{ id: "one", name: "Jane Smith", email: "jane@example.org", organization: "University of Toronto", position: "Other", badgeRole: "", status: "approved", source: "luma", tickets: 1 }],
    edits: {}, jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null,
  };
  for (const title of ["Other", "OTHER (please specify)", "N/A", "Not provided"]) {
    const candidate = { ...board, guests: [{ ...board.guests[0], position: title }] };
    const flagged = printPeople(candidate)[0];
    assert.ok(flagged.issues.some(i => i.includes("placeholder title / role")), title);
    assert.equal(flagged.position, title);
    assert.ok(attentionItems([flagged]).some(i => i.kind === "review"));
    const accepted = applyPrintAction(candidate, [flagged], { action: "edit", id: "one", badge: {
      name: flagged.name, position: title, organization: flagged.organization, extra: "", reviewed: true,
    } }, "Admin", "unused", "2026-10-27T12:00:00.000Z").board;
    assert.deepEqual(accepted.guests, candidate.guests);
    assert.deepEqual(printPeople(accepted)[0].issues, []);
  }
  const tooLong = { ...board, guests: [{ ...board.guests[0], position: "Director ".repeat(25) }] };
  assert.ok(printPeople(tooLong)[0].issues.some(i => i.includes("too long for one line")));
  for (const title of ["Research Associate", "Postdoctoral Fellow", "Volunteer"]) {
    assert.deepEqual(printPeople({ ...board, guests: [{ ...board.guests[0], position: title }] })[0].issues, []);
  }
});

test("approving the displayed badge clears review flags without changing text, registration or extra-ticket warnings", () => {
  const board: PrintBoard = {
    guests: [{ id: "echo", name: "Echo", email: "echo@example.org", organization: "University of Toronto", position: "PhD student", badgeRole: "HQP Representative", status: "approved", source: "luma", tickets: 2 }],
    edits: {}, jobs: [], syncedAt: null, tentText: "", agendaText: "", tentTemplate: null, agendaTemplate: null,
  };
  const before = printPeople(board)[0];
  assert.ok(attentionItems([before]).some(item => item.kind === "review"));
  const approved = applyPrintAction(board, [before], { action: "edit", id: before.id, badge: {
    name: before.name, position: before.position, organization: before.organization, extra: before.extra, singleName: before.singleName, reviewed: true,
  }, reason: "Approved current displayed badge details without editing." }, "Admin", "unused", "2026-10-26T20:00:00.000Z").board;
  assert.deepEqual(approved.guests, board.guests);
  const after = printPeople(approved)[0];
  for (const field of ["name", "position", "organization", "extra", "status", "printStatus"] as const) assert.equal(after[field], before[field]);
  assert.deepEqual(attentionItems([after]).map(item => item.kind), ["guests"]);
  const synced = mergePrintGuests(approved, board.guests, "2026-10-26T20:05:00.000Z");
  assert.equal(synced.edits.echo.reviewed, true);
  const changed = mergePrintGuests(approved, [{ ...board.guests[0], email: "new@example.org" }], "2026-10-26T20:05:00.000Z");
  assert.equal(changed.edits.echo.reviewed, false, "changed source data must be reviewed again");
});
