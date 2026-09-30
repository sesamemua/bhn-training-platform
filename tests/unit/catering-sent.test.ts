/** A new allergy after the cards went out is flagged, per session. */
import test from "node:test";
import assert from "node:assert/strict";
import { newSinceSent, parseSent, recordSent } from "../../src/lib/allocation/catering-sent";
import type { Entry } from "../../src/lib/allocation/catering";

const e = (workshopId: string, name: string, dietary: string[], dietaryOther = ""): Entry => ({
  workshopId, workshop: workshopId.toUpperCase(), start: "2026-10-26T13:00:00Z", personKey: name, name, dietary, dietaryOther, accessibility: "",
});

test("only sessions already given to the caterer, and only cards they did not have", () => {
  const before = [e("mon", "Ana", ["Halal"]), e("tue", "Ben", ["Vegan"])];
  const sent = recordSent({}, [before[0]], "Ruilin", "print", "2026-10-20T12:00:00Z");
  const now = [...before, e("mon", "Cy", ["Halal"], "Allergic to kiwi"), e("tue", "Di", ["Nut allergy"])];
  const found = newSinceSent(sent, now);
  assert.deepEqual(found.map((f) => [f.workshopId, f.cards.map((c) => c.label)]), [["mon", ["Kiwi"]]], "tue was never printed, so nothing to compare");
  assert.equal(found[0].since.by, "Ruilin");
  // Printing again clears it.
  assert.deepEqual(newSinceSent(recordSent(sent, now.filter((x) => x.workshopId === "mon"), "Ruilin", "print", "2026-10-21T12:00:00Z"), now), []);
});

test("an unreadable record is empty, never fatal", () => {
  assert.deepEqual(parseSent("nope"), {});
  assert.deepEqual(parseSent(JSON.stringify({ mon: { at: "x" } })), {});
});
