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

import { reviewPath, reviewRequestEmail } from "../../src/lib/social/review";
test("the review email names who asked, carries the note, the link and the post", () => {
  const m = reviewRequestEmail({ reviewerName: "Ana Lee", requesterName: "Ruilin", title: "Panel recap", note: "Check the dates.", body: "We had a great day.", link: "https://x.test" + reviewPath("p1") });
  assert.equal(m.subject, "Please review: Panel recap");
  assert.match(m.text, /^Hi Ana,/);
  assert.match(m.text, /Ruilin asked you to review/);
  assert.match(m.text, /Check the dates\./);
  assert.match(m.text, /https:\/\/x\.test\/admin\/workspace\/marketing\/social\?post=p1/);
  assert.match(m.text, /We had a great day\./);
});

import { hasMention, TAGGABLE, tagLabel, toggleMention } from "../../src/lib/social/tags";
test("tags toggle in and out of the post's closing mentions line", () => {
  assert.equal(TAGGABLE.length, 9);
  assert.ok(!TAGGABLE.includes("@BioHubNet" as never));
  assert.equal(tagLabel("@Canadian Hub for Health Intelligence and Innovation in Infectious Diseases (HI³)"), "HI³");
  let body = "Great panel today.";
  body = toggleMention(body, "@Molly Shoichet");
  assert.equal(body, "Great panel today.\n\n@Molly Shoichet");
  body = toggleMention(body, "@Roshni");
  assert.equal(body, "Great panel today.\n\n@Molly Shoichet, @Roshni");
  assert.ok(hasMention(body, "@Roshni"));
  body = toggleMention(body, "@Molly Shoichet");
  assert.equal(body, "Great panel today.\n\n@Roshni");
  body = toggleMention(body, "@Roshni");
  assert.equal(body, "Great panel today.");
  assert.equal(toggleMention("", "@Yeseul"), "@Yeseul");
  // An @ inside a sentence isn't the mentions line.
  assert.equal(toggleMention("Thanks @Roshni for hosting.", "@Roshni"), "Thanks @Roshni for hosting.\n\n@Roshni");
});
