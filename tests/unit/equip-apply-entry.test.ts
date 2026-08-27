import test from "node:test";
import assert from "node:assert/strict";
import { STREAMS } from "../../src/app/equip-apply/[stream]/page";

/**
 * The external link. It goes on biohubnet.ca, so most people clicking
 * it are signed out — and everything under the (dashboard) group
 * redirects a signed-out visitor to a bare /login, losing the stream
 * and the intent with it. This route is the way round that.
 */

test("the URL spellings a website author might reasonably write", () => {
  for (const s of ["venture-connect", "ventureconnect", "connect"]) {
    assert.equal(STREAMS[s], "venture_connect", `${s} should reach VentureConnect`);
  }
  for (const s of ["venture-lift", "venturelift", "lift"]) {
    assert.equal(STREAMS[s], "venture_lift", `${s} should reach VentureLift`);
  }
});

test("the URL spelling is not the stored value", () => {
  // A link on somebody else's website should not be a database
  // identifier — renaming the column must not break their button.
  assert.equal(STREAMS["venture_connect"], undefined);
  assert.equal(Object.values(STREAMS).every((v) => v.includes("_")), true);
  assert.equal(Object.keys(STREAMS).some((k) => k.includes("_")), false);
});

test("an unknown spelling is absent, so the page can send them somewhere useful", () => {
  assert.equal(STREAMS["nonsense"], undefined);
  assert.equal(STREAMS[""], undefined);
});
