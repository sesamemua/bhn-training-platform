import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SymposiumPeoplePlanner } from "../../src/components/admin/events/SymposiumPeoplePlanner";

test("planner has a labelled push button that stays disabled until the board is loaded", () => {
  const html = renderToStaticMarkup(<SymposiumPeoplePlanner />);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Push changes to website<\/button>/);
  assert.ok(!renderToStaticMarkup(<SymposiumPeoplePlanner view="roster" />).includes("Push changes to website"));
});
