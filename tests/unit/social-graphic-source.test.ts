/** A social post's graphic is found in Design Review by the post it came from. */
import test from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_SOURCE_PREFIX, socialSource } from "../../src/lib/social/graphic-source";

test("the link from an artwork back to its post is the post id, and reads back", () => {
  const s = socialSource("cmabc123");
  assert.equal(s, "social:cmabc123");
  assert.equal(s.slice(SOCIAL_SOURCE_PREFIX.length), "cmabc123");
});
