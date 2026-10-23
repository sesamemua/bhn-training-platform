import assert from "node:assert/strict";
import test from "node:test";
import { DISCUSSION_GROUPS, SYMPOSIUM_DISCUSSION_POSTS } from "../../src/lib/social/symposium-discussion-posts";
import { NETWORKING_GROUPS } from "../../src/lib/social/symposium-networking-posts";
import { withSocialTags } from "../../src/lib/social/tags";

test("remaining session drafts cover nine people once and exclude people already featured", () => {
  const names = [...NETWORKING_GROUPS[3].people.map((p) => p.name), ...DISCUSSION_GROUPS.flatMap<string>((g) => g.people.map((p) => p.name))];
  assert.equal(names.length, 9);
  assert.equal(new Set(names).size, 9);
  for (const name of ["Mona Abu Nameh", "Jasmine Hamilton", "Sven Ansorge", "Anu Vajjala", "Kathy Lee", "Yosuke Niibori", "Angela Davoud", "Donghoon Lee", "Cynthia Elias", "David Sealey", "Lynne Liu", "Liz Csaszar", "Shadan Ashfaie"]) {
    assert.ok(!names.includes(name), name);
  }
  assert.deepEqual(DISCUSSION_GROUPS.map((g) => g.people.length), [3, 2]);
  for (const post of SYMPOSIUM_DISCUSSION_POSTS) {
    const text = withSocialTags(post.body);
    assert.ok(text.length < 2500);
    assert.match(text, /Interactive Discussion Session/);
    assert.match(text, /concurrently/);
    assert.doesNotMatch(text, /register|registration closes/i);
    assert.doesNotMatch(post.graphicBrief, /Register now|Register by/);
    assert.match(text, /Symposium program:/);
    assert.match(text, /@BioHubNet/);
    assert.doesNotMatch(text, /luma\.com|guaranteed|full biography/i);
  }
  assert.match(SYMPOSIUM_DISCUSSION_POSTS[0].body, /Discussion topic: AI and the Future of Work in Life Sciences/);
  assert.doesNotMatch(SYMPOSIUM_DISCUSSION_POSTS[1].body, /Discussion topic:/);
});
