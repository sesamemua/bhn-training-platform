/** A tabbed script's versions are tagged with the tabs they changed. */
import test from "node:test";
import assert from "node:assert/strict";
import { changedTabs, docPanelChunks } from "../../src/lib/scripts/content";

const doc = (active: string, gilbert: string) =>
  `<main><div class="doc-panels">` +
  `<div class="doc-panel${active === "molly" ? " active" : ""}" data-tab="molly" data-label="Molly"><p>Molly</p></div>` +
  `<div class="doc-panel${active === "gilbert" ? " active" : ""}" data-tab="gilbert" data-label="Gilbert"><p>${gilbert}</p></div>` +
  `</div></main>`;

test("panels are split by their opening tags", () => {
  assert.deepEqual([...docPanelChunks(doc("molly", "x")).keys()], ["molly", "gilbert"]);
  assert.equal(docPanelChunks("<p>no tabs</p>").size, 0);
});

test("only edited tabs count; switching tabs is not an edit", () => {
  assert.deepEqual(changedTabs(doc("molly", "a"), doc("gilbert", "a")), []);
  assert.deepEqual(changedTabs(doc("molly", "a"), doc("molly", "b")), ["gilbert"]);
  assert.deepEqual(changedTabs("<p>before tabs</p>", doc("molly", "a")), ["molly", "gilbert"]);
});
