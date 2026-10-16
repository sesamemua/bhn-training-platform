import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoordinatorInfoCells, CoordinatorInfoSummary } from "../../src/components/workspace/CoordinatorInfoSummary";

test("email-supplied attendee details are visible without opening the registration", () => {
  const html = renderToStaticMarkup(createElement(CoordinatorInfoSummary, { info: {
    name: "Person Name", institution: "University of Toronto", position: "Master's student",
    company: "Venture", participation: "Pitch/poster", emailSource: "Email missing",
    recordedBy: "Ruilin Yuan", recordedAt: "2026-10-16T22:05:23Z",
  } }));
  const visible = html.slice(0, html.indexOf("<details"));
  for (const value of ["University of Toronto", "Venture", "Pitch/poster", "Current role", "Institution", "Participation"]) assert.ok(visible.includes(value));
  assert.match(html, /Information from Roshni/);
  assert.match(html, /Supplied separately from the registrant/);
  assert.match(html, /Recorded by Ruilin Yuan/);
  assert.match(html, /Email missing/);
});

test("no coordinator import means no invented source details", () => {
  assert.equal(renderToStaticMarkup(createElement(CoordinatorInfoSummary, {})), "");
});

test("the attendee table exposes all four source columns, leaving unknown details unfilled", () => {
  const info = { name: "Guest", institution: "University of Toronto", position: "Founder", company: "Venture", participation: "Panelist", emailSource: "Missing", recordedBy: "Admin", recordedAt: "2026-10-16T22:05:23Z" };
  const html = renderToStaticMarkup(createElement(CoordinatorInfoCells, { info }));
  assert.equal((html.match(/<td /g) ?? []).length, 4);
  for (const value of ["University of Toronto", "Founder", "Venture", "Panelist"]) assert.ok(html.includes(value));
  assert.match(renderToStaticMarkup(createElement(CoordinatorInfoCells, { info: { ...info, institution: "" } })), /Not supplied/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(CoordinatorInfoCells, {})), /University|Founder|Venture|Panelist/);
});
