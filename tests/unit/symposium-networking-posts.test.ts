import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { NETWORKING_GROUPS, SYMPOSIUM_NETWORKING_POSTS } from "../../src/lib/social/symposium-networking-posts";
import { withSocialTags } from "../../src/lib/social/tags";
import { DEFAULT_SOCIAL_ORDER, readSocialOrder } from "../../src/lib/social/order";

test("networking series retains published groups and features remaining people without repeating Jasmine", () => {
  assert.deepEqual(NETWORKING_GROUPS.map((g) => g.people.length), [4, 3, 4, 4]);
  const names = NETWORKING_GROUPS.flatMap((g) => g.people.map((p) => p.name));
  assert.equal(new Set(names).size, 15);
  assert.ok(NETWORKING_GROUPS[2].people.some((p) => p.name === "Anu Vajjala"));
  assert.ok(names.includes("Melissa E Anders"));
  assert.ok(NETWORKING_GROUPS[3].people.some((p) => p.name === "Morty Soley"));
  assert.ok(!names.includes("Jasmine Hamilton"));
  assert.ok(!names.some((name) => /Czaniecki|Shivali/.test(name)));
  for (const post of SYMPOSIUM_NETWORKING_POSTS) {
    const body = withSocialTags(post.body);
    assert.ok(body.length < 2000);
    assert.match(body, /Structured Networking with Industry Professionals/);
    assert.match(body, /3:30-4:45 p\.m\. ET/);
    if (post.slug.endsWith("-4")) {
      assert.doesNotMatch(body, /register|registration closes/i);
      assert.doesNotMatch(post.graphicBrief, /Register now|Register by/);
      assert.match(body, /Symposium program:/);
    } else assert.match(body, /Registration closes October 23/);
    assert.match(body, /@BioHubNet/);
    assert.doesNotMatch(body, /luma\.com|guaranteed|full biography/i);
    assert.ok(existsSync(`public/social/symposium-2026/networking-${NETWORKING_GROUPS[SYMPOSIUM_NETWORKING_POSTS.indexOf(post)].number}.png`));
    for (const person of NETWORKING_GROUPS[SYMPOSIUM_NETWORKING_POSTS.indexOf(post)].people) {
      assert.ok(body.includes(`@${person.name}, ${person.title}, ${person.company}`));
    }
  }
});

test("existing shared order gains networking drafts without losing anyone's rearrangement", () => {
  const slugs = new Set(SYMPOSIUM_NETWORKING_POSTS.map((p) => p.slug));
  const previous = DEFAULT_SOCIAL_ORDER.filter((slug) => !slugs.has(slug)).reverse();
  const migrated = readSocialOrder(previous);
  assert.deepEqual(migrated.filter((slug) => !slugs.has(slug)), previous);
  assert.deepEqual(migrated.slice(migrated.indexOf("symposium-2026-biomanufacturing-panel") + 1, migrated.indexOf("symposium-2026-biomanufacturing-panel") + 5), [...slugs]);
  assert.deepEqual(readSocialOrder(migrated), migrated);
});
