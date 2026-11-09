import test from "node:test";
import assert from "node:assert/strict";
import { waitingOn, type SocialComment } from "../../src/lib/social/review";
import { SOCIAL_MENTIONS, withSocialTags } from "../../src/lib/social/tags";

const c = (at: string, reviewerName?: string): SocialComment => ({ id: at, author: "Ruilin", at, body: "x", reviewerName });

test("a post waits on the latest teammate asked since it was last approved", () => {
  assert.equal(waitingOn([], null), null);
  assert.equal(waitingOn([c("2026-11-09T10:00:00Z")], null), null); // a plain comment asks nobody
  assert.equal(waitingOn([c("2026-11-09T10:00:00Z", "Ana"), c("2026-11-09T11:00:00Z", "Ben")], null), "Ben");
  // Approving answers every ask before it.
  assert.equal(waitingOn([c("2026-11-09T10:00:00Z", "Ana")], "2026-11-09T12:00:00Z"), null);
  assert.equal(waitingOn([c("2026-11-09T13:00:00Z", "Ana")], "2026-11-09T12:00:00Z"), "Ana");
});

test("team-written LinkedIn posts don't get the symposium tags", () => {
  assert.equal(withSocialTags("Hello", "linkedin"), "Hello");
  assert.ok(withSocialTags("Hello", "events").endsWith(SOCIAL_MENTIONS.join(", ")));
});
