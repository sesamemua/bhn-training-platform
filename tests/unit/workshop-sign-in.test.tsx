import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkshopSignInSheet, type SignInWorkshop } from "../../src/components/training-week/WorkshopSignInSheet";

let sequence = 0;
const booking = (name: string, status = "confirmed", withdrawnAt: Date | null = null) => ({
  id: `booking-${++sequence}`, submissionId: null, userId: null,
  status, withdrawnAt, submission: { email: null, data: { full_name: name, trainee_email: `private-${sequence}@example.org`, dietary: "PRIVATE DIET" } }, user: null,
});
const workshop: SignInWorkshop = {
  title: "Communication Chameleon", startDateTime: new Date("2026-10-27T13:00:00Z"),
  endDateTime: new Date("2026-10-27T16:00:00Z"), locationName: "Chelsea Hotel", bookings: [],
};
const render = (bookings: SignInWorkshop["bookings"], sortBy: "first" | "last" = "first") => renderToStaticMarkup(<WorkshopSignInSheet workshop={{ ...workshop, bookings }} sortBy={sortBy} />);

test("approved active attendees only, alphabetized, with blank initials and no private answers", () => {
  const html = render([booking("Zoe Li"), booking("Alice Feng"), booking("Pending", "pending"), booking("Waitlisted", "waitlist"), booking("Declined", "cancelled"), booking("Withdrawn", "confirmed", new Date())]);
  assert.ok(html.indexOf("Alice Feng") < html.indexOf("Zoe Li"));
  for (const privateText of ["Pending", "Waitlisted", "Declined", "Withdrawn", "private@example.org", "PRIVATE DIET"]) assert.ok(!html.includes(privateText));
  assert.equal((html.match(/<td class="initials"><\/td>/g) ?? []).length, 2);
  assert.match(html, /2 approved attendees/);
  assert.match(html, /Tuesday, October 27, 2026/);
  assert.match(html, /9:00/);
  assert.match(html, /Chelsea Hotel/);
});

test("supports manual names without email, accented names, older forms and account fallbacks", () => {
  const html = render([
    booking("Élodie Roy"),
    { ...booking(""), submission: { email: null, data: { first_name: "Andrea", last_name: "Leung" } } },
    { ...booking(""), submission: null, user: { name: "Account Name", email: "account@example.org" } },
    { ...booking(""), submission: null, user: null },
    booking("<script>alert('x')</script>"),
  ]);
  for (const name of ["Élodie Roy", "Andrea Leung", "Account Name", "Name not provided"]) assert.ok(html.includes(name));
  assert.ok(!html.includes("<script>"));
});

test("duplicate registrations use existing mailbox matching, but equal names with different identities stay separate", () => {
  const latest = { ...booking("Updated Name"), submission: { email: "Jane.Doe+event@gmail.com", data: { full_name: "Updated Name" } } };
  const older = { ...booking("Old Name"), submission: { email: "janedoe@googlemail.com", data: { full_name: "Old Name" } } };
  const html = render([latest, older, booking("Same Name"), booking("Same Name"),
    { ...booking("No Email"), submission: { email: null, data: { full_name: "No Email" } } },
    { ...booking("No Email"), submission: { email: null, data: { full_name: "No Email" } } },
  ]);
  assert.match(html, /Updated Name/);
  assert.ok(!html.includes("Old Name"));
  assert.equal((html.match(/>Same Name<\/td>/g) ?? []).length, 2);
  assert.equal((html.match(/>No Email<\/td>/g) ?? []).length, 2);
  assert.match(html, /5 approved attendees/);
  assert.ok(!html.includes("gmail.com"));
});

test("compact columns fit current workshop sizes on one page without dropping people", () => {
  for (const [count, columns] of [[12, 1], [30, 1], [31, 2], [60, 2], [61, 3], [85, 3], [90, 3]]) {
    const html = render(Array.from({ length: count }, (_, i) => booking(`Person ${i + 1}`)));
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.equal((html.match(/Participant name/g) ?? []).length, columns);
    assert.equal((html.match(/<td class="initials"><\/td>/g) ?? []).length, count);
    assert.match(html, /Page 1 of 1/);
    assert.match(html, /height: auto !important; min-height: 0 !important/);
    assert.ok(html.includes(`repeat(${columns}, minmax(0, 1fr))`));
    assert.match(html, new RegExp(`<td class="number">${count}</td>`));
  }
});

test("rosters beyond a readable single page retain all names, headings and continuous numbering", () => {
  const html = render(Array.from({ length: 91 }, (_, i) => booking(`Person ${i + 1}`)));
  assert.equal((html.match(/<h1>/g) ?? []).length, 2);
  assert.equal((html.match(/Participant name/g) ?? []).length, 4);
  assert.equal((html.match(/<td class="initials"><\/td>/g) ?? []).length, 91);
  assert.match(html, /Page 2 of 2/);
  assert.match(html, /<td class="number">91<\/td>/);
  assert.match(html, /break-inside: avoid/);
  assert.match(html, /size: letter portrait/);
});

test("first and last name sorting are selectable, stable and do not rewrite names", () => {
  const bookings = [booking("Zoe Adams"), booking("Alice Young"), booking("Dr. Bea Zane"), booking("Reema"),
    { ...booking("Gregory de Crescenzo"), submission: { email: "greg@example.org", data: { full_name: "Gregory de Crescenzo", last_name: "de Crescenzo" } } },
  ];
  const first = render(bookings, "first"), last = render(bookings, "last");
  const names = (html: string) => [...html.matchAll(/<td>([^<]+)<\/td>/g)].map((m) => m[1]);
  assert.deepEqual(names(first), ["Alice Young", "Dr. Bea Zane", "Gregory de Crescenzo", "Reema", "Zoe Adams"]);
  assert.deepEqual(names(last), ["Zoe Adams", "Gregory de Crescenzo", "Reema", "Alice Young", "Dr. Bea Zane"]);
  assert.match(first, /href="\?sort=first" aria-current="page"/);
  assert.match(last, /href="\?sort=last" aria-current="page"/);
  assert.match(last, /Sorted by last name/);
});

test("empty workshops still have one printable sheet and a clear empty state", () => {
  const html = render([]);
  assert.match(html, /No approved attendees yet/);
  assert.match(html, /Page 1 of 1/);
  assert.match(html, /Print this page/);
});
