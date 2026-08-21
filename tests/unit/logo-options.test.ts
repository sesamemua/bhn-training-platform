import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import {
  fullSrc, LOGO_OPTIONS, optionById, tileSrc, VOTES_PER_PERSON,
} from "../../src/lib/symposium/logo-options";

const publicPath = (src: string) => `public${src}`;

test("every candidate has both the pictures the page asks for", () => {
  // A missing file is a broken tile in a grid of sixty, which nobody
  // notices until somebody votes for the one they cannot see.
  for (const o of LOGO_OPTIONS) {
    assert.ok(existsSync(publicPath(tileSrc(o))), `no tile for ${o.slug}`);
    assert.ok(existsSync(publicPath(fullSrc(o))), `no full image for ${o.slug}`);
  }
});

test("ids are unique — a vote is stored against one", () => {
  assert.equal(new Set(LOGO_OPTIONS.map((o) => o.id)).size, LOGO_OPTIONS.length);
});

test("slugs are unique — they name the files", () => {
  assert.equal(new Set(LOGO_OPTIONS.map((o) => o.slug)).size, LOGO_OPTIONS.length);
});

test("an id resolves back to its candidate, and an unknown one does not", () => {
  // The action rejects a vote for anything optionById cannot find, so
  // this is the guard between a POST and a row.
  assert.equal(optionById(LOGO_OPTIONS[0].id)?.slug, LOGO_OPTIONS[0].slug);
  assert.equal(optionById("does-not-exist"), undefined);
  assert.equal(optionById(""), undefined);
});

test("every candidate reads as something, not as a filename", () => {
  for (const o of LOGO_OPTIONS) {
    assert.ok(o.label.length > 2, `${o.slug} has no label`);
    assert.ok(!o.label.includes("-"), `${o.slug} kept its hyphens`);
    assert.match(o.label[0], /[A-Z0-9]/, `${o.slug} is not capitalised`);
  }
});

test("the whole grid stays light enough to open", () => {
  // Sixty tiles load on first paint if lazy-loading ever comes off, so
  // the set has a budget rather than whatever the exporter produced —
  // the originals were 85 MB.
  const tiles = LOGO_OPTIONS.reduce((n, o) => n + statSync(publicPath(tileSrc(o))).size, 0);
  assert.ok(tiles < 3 * 1024 * 1024, `tiles total ${(tiles / 1024 / 1024).toFixed(1)} MB`);
  const full = LOGO_OPTIONS.reduce((n, o) => n + statSync(publicPath(fullSrc(o))).size, 0);
  assert.ok(full < 8 * 1024 * 1024, `full images total ${(full / 1024 / 1024).toFixed(1)} MB`);
});

test("a tile is meaningfully smaller than its full version", () => {
  // If the build ever emits the same size twice, the grid is paying
  // full-image weight for a thumbnail.
  for (const o of LOGO_OPTIONS) {
    const t = statSync(publicPath(tileSrc(o))).size;
    const f = statSync(publicPath(fullSrc(o))).size;
    assert.ok(t < f, `${o.slug}: tile is not smaller than full`);
  }
});

test("three picks — enough to say which are good, few enough to mean something", () => {
  assert.equal(VOTES_PER_PERSON, 3);
  assert.ok(VOTES_PER_PERSON < LOGO_OPTIONS.length / 5, "a cap this loose stops being a choice");
});

test("there are actually candidates to vote on", () => {
  assert.ok(LOGO_OPTIONS.length >= 2, "a vote needs something to choose between");
});
