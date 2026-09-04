import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionCalendar } from "../../src/components/workspace/SessionCalendar";
import { TrainingWeekCalendar } from "../../src/components/workspace/TrainingWeekCalendar";
import type { AdminWorkshop } from "../../src/lib/allocation/admin-types";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import { parseForm } from "../../src/lib/formbuilder/types";
import { displayVenue, SESSIONS, torontoToUtc } from "../../src/lib/training-week/schedule-2026";

/**
 * One week, drawn twice — and the two drawings have to agree.
 *
 * The registration form and the Admin dashboard used to own separate
 * copies of the same calendar. They drifted, quietly and in three
 * directions at once: 62px an hour against 56, a w-11 gutter against
 * w-12, a 520px floor against 560. Nobody could see it, because seeing
 * it means opening two screens side by side and measuring.
 *
 * So it is measured here instead. Both screens are rendered over the
 * SAME week and the same session is required to land on the same pixel
 * on both. A second implementation of the geometry cannot be added
 * without this failing.
 */

const field = parseForm(TRAINING_WEEK_FORM).fields.find((f) => f.key === "sessions")!;

const workshops: AdminWorkshop[] = SESSIONS.map((s) => ({
  id: s.slug,
  slug: s.slug,
  title: s.title,
  kind: s.kind,
  capacity: s.capacity,
  waitlistCapacity: 5,
  requiresApproval: false,
  isActive: true,
  startDateTime: torontoToUtc(s.day, s.start).toISOString(),
  endDateTime: torontoToUtc(s.day, s.end).toISOString(),
  locationName: displayVenue(s.venue),
  partnerOrganization: s.partner,
  shortDescription: s.summary,
  bookings: [],
}));

const picker = renderToStaticMarkup(
  React.createElement(SessionCalendar, { field, chosen: [field.options[0]], onToggle: () => {} }),
);
const admin = renderToStaticMarkup(
  React.createElement(TrainingWeekCalendar, { workshops }),
);

/**
 * Where one session's box was drawn.
 *
 * Found by the tooltip rather than by position in the document: the two
 * screens order their cells the same way today and this test should not
 * be the thing that breaks if one of them stops.
 */
function boxOf(html: string, session: string): string {
  // "Lunch & Learn" reaches the attribute as "Lunch &amp; Learn".
  const at = html.indexOf(`title="${session.replace(/&/g, "&amp;")} ·`);
  assert.notEqual(at, -1, `no cell for "${session}"`);
  const style = /style="([^"]*)"/.exec(html.slice(at));
  assert.ok(style, `no style on the cell for "${session}"`);
  return style[1];
}

test("a session is drawn at the same place on the form and on the dashboard", () => {
  for (const s of SESSIONS) {
    assert.equal(
      boxOf(admin, s.title),
      boxOf(picker, s.title),
      `"${s.title}" is drawn in two different places`,
    );
  }
});

test("every session's box is a real position, not a default", () => {
  // Guards the comparison above: two empty strings are also equal.
  const box = boxOf(picker, "CCRM tour + Lunch & Learn");
  for (const part of ["top:", "height:", "left:", "width:"]) {
    assert.ok(box.includes(part), `${part} missing from ${box}`);
  }
  assert.ok(/top:\d/.test(box), `top is not a number in ${box}`);
});

test("both screens measure an hour at the same height", () => {
  for (const [name, html] of [["form", picker], ["dashboard", admin]] as const) {
    assert.match(html, /\[--hour:46px\]/, `${name} lost the stacked hour height`);
    assert.match(html, /@xl:\[--hour:62px\]/, `${name} lost the side-by-side hour height`);
  }
});

test("both screens draw the hour scale identically", () => {
  // The scale is the thing every block is measured against. If the two
  // gutters differ — in width, in type size, in how many labels they
  // carry — the same box means two different times.
  const scaleOf = (html: string) => {
    const hits = html.match(/<div class="w-11 shrink-0 flex-col[^"]*"[\s\S]*?<\/div><\/div>/);
    assert.ok(hits, "no hour scale drawn");
    return hits[0].replace(/ class="hidden @xl:flex"| class="col-start-1 row-start-2 flex @xl:hidden"/, "");
  };
  assert.equal(scaleOf(admin), scaleOf(picker));
});

test("neither screen carries its own minimum width", () => {
  // The dashboard's 560px floor is what made the week scroll sideways
  // on a phone with Wednesday off the edge. One floor now, and it only
  // applies once the days are side by side.
  for (const [name, html] of [["form", picker], ["dashboard", admin]] as const) {
    assert.doesNotMatch(html, /min-w-\[560px\]/, `${name} still has its own floor`);
    assert.match(html, /@xl:min-w-\[520px\]/, `${name} lost the shared floor`);
  }
});

test("the dashboard stacks its days below the breakpoint like the form does", () => {
  // The stacked layout is a container query on the row, not a viewport
  // one — the same calendar is drawn at four different widths.
  assert.match(admin, /@container/);
  assert.match(admin, /@xl:flex-row/);
});

test("the day is spelled the same way on both screens", () => {
  // en-GB, pinned. `undefined` is the SERVER's locale on the first
  // paint and the BROWSER's on hydration, which is both a React text
  // mismatch and two spellings of one date across two screens.
  for (const html of [picker, admin]) assert.match(html, /Mon 26 Oct/i);
});

test("a session with no workshop behind it is drawn as nothing", () => {
  // The dashboard's grid is built from Workshop rows; a slot whose row
  // has gone must not leave an empty box with a seat count on it.
  const partial = renderToStaticMarkup(
    React.createElement(TrainingWeekCalendar, { workshops: workshops.slice(0, 2) }),
  );
  assert.match(partial, /CCRM tour/);
  assert.doesNotMatch(partial, /Negotiation Skills/);
});

test("the picker's cells are buttons and the receipt's are not", () => {
  const receipt = renderToStaticMarkup(
    React.createElement(SessionCalendar, { readOnly: true, field, chosen: [field.options[0]] }),
  );
  assert.match(picker, /<button[^>]*aria-pressed/);
  // A cell that does nothing when clicked reads as broken, so a receipt
  // gets divs rather than buttons with the handler quietly removed.
  assert.doesNotMatch(receipt, /<button/);
  assert.match(receipt, /aria-hidden="true"/);
});
