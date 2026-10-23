import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkshopSignInSheet, type SignInWorkshop } from "../../src/components/training-week/WorkshopSignInSheet";

const booking = (name: string, status = "confirmed", withdrawnAt: Date | null = null) => ({
  status, withdrawnAt, submission: { data: { full_name: name, trainee_email: "private@example.org", dietary: "PRIVATE DIET" } }, user: null,
});
const workshop: SignInWorkshop = {
  title: "Communication Chameleon", startDateTime: new Date("2026-10-27T13:00:00Z"),
  endDateTime: new Date("2026-10-27T16:00:00Z"), locationName: "Chelsea Hotel", bookings: [],
};
const render = (bookings: SignInWorkshop["bookings"]) => renderToStaticMarkup(<WorkshopSignInSheet workshop={{ ...workshop, bookings }} />);

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
    { ...booking(""), submission: { data: { first_name: "Andrea", last_name: "Leung" } } },
    { ...booking(""), submission: null, user: { name: "Account Name" } },
    { ...booking(""), submission: null, user: null },
    booking("<script>alert('x')</script>"),
  ]);
  for (const name of ["Élodie Roy", "Andrea Leung", "Account Name", "Name not provided"]) assert.ok(html.includes(name));
  assert.ok(!html.includes("<script>"));
});

test("paginates with repeated workshop and column headings and continuous numbering", () => {
  const html = render(Array.from({ length: 37 }, (_, i) => booking(`Person ${String(i + 1).padStart(2, "0")}`)));
  assert.equal((html.match(/<h1>/g) ?? []).length, 3);
  assert.equal((html.match(/Participant name/g) ?? []).length, 3);
  assert.equal((html.match(/<td class="initials"><\/td>/g) ?? []).length, 37);
  assert.match(html, /Page 3 of 3/);
  assert.match(html, /<td class="number">37<\/td>/);
  assert.match(html, /break-inside: avoid/);
  assert.match(html, /size: letter portrait/);
});

test("empty workshops still have one printable sheet and a clear empty state", () => {
  const html = render([]);
  assert.match(html, /No approved attendees yet/);
  assert.match(html, /Page 1 of 1/);
  assert.match(html, /Print this page/);
});
