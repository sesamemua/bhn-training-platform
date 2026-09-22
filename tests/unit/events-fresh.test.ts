import test from "node:test";
import assert from "node:assert/strict";
import { freshly } from "../../src/lib/events/fresh";

/** A clock the test moves, so nothing waits four minutes. */
function clock(start = 0) {
  let t = start;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
}

test("one read serves every dashboard until it is stale", async () => {
  const c = clock();
  let reads = 0;
  const fresh = freshly<number>({ ttlMs: 60_000, now: c.now });
  const read = () => fresh("luma", async () => { reads += 1; return reads; });

  assert.equal(await read(), 1);
  assert.equal(await read(), 1, "a second dashboard takes what is held");
  c.tick(59_000);
  assert.equal(await read(), 1);
  c.tick(2_000);
  assert.equal(await read(), 2, "past the age limit it reads again");
  assert.equal(reads, 2, "ten lookups, two requests");
});

test("Refresh gets a fresh read, but cannot become a poll", async () => {
  const c = clock();
  let reads = 0;
  const fresh = freshly<number>({ ttlMs: 240_000, forceEveryMs: 30_000, now: c.now });
  const read = (force = false) => fresh("luma", async () => { reads += 1; return reads; }, force);

  await read();
  assert.equal(reads, 1);
  c.tick(5_000);
  await read(true);
  assert.equal(reads, 1, "held down within the floor, it serves what it has");
  c.tick(30_000);
  await read(true);
  assert.equal(reads, 2, "past the floor, Refresh means refresh");
});

test("two keys are two answers", async () => {
  const fresh = freshly<string>({ ttlMs: 1_000 });
  assert.equal(await fresh("a", async () => "one"), "one");
  assert.equal(await fresh("b", async () => "two"), "two");
  assert.equal(await fresh("a", async () => "three"), "one");
});
