import test from "node:test";
import assert from "node:assert/strict";
import { isPurgeable, nearestSwatch, normalizeTags, publishBlock, titleFromFileName } from "../../src/lib/assets/core";

const now = new Date("2026-11-09T12:00:00Z");

test("a picture naming people needs recorded consent before it can be published", () => {
  assert.equal(publishBlock({ consent: "unknown", people: null, expiresAt: null }, now), null);
  assert.match(publishBlock({ consent: "unknown", people: "Ana Lee", expiresAt: null }, now)!, /Ana Lee/);
  assert.equal(publishBlock({ consent: "given", people: "Ana Lee", expiresAt: null }, now), null);
  assert.match(publishBlock({ consent: "refused", people: null, expiresAt: null }, now)!, /refused/);
  assert.match(publishBlock({ consent: "given", people: null, expiresAt: "2026-11-01T00:00:00Z" }, now)!, /expired/);
  assert.match(publishBlock({ consent: "given", people: null, expiresAt: null, deletedAt: now }, now)!, /trash/);
});

test("trash is purged only after thirty days", () => {
  assert.equal(isPurgeable(null, now), false);
  assert.equal(isPurgeable("2026-10-11T12:00:01Z", now), false);
  assert.equal(isPurgeable("2026-10-10T12:00:00Z", now), true);
});

test("tags are tidy and titles readable", () => {
  assert.deepEqual(normalizeTags("Summit, Panel  2 , summit,"), ["panel 2", "summit"]);
  assert.equal(titleFromFileName("IMG_0412-panel_2.JPG"), "IMG 0412 panel 2");
  assert.equal(nearestSwatch("#2f70d1"), "blue");
  assert.equal(nearestSwatch("#fafafa"), "white");
});

import { duplicateGroups, hamming, inferOrigin, aiDisclosure } from "../../src/lib/assets/core";

test("origin is suggested from the file's own metadata", () => {
  assert.equal(inferOrigin({ digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" }), "ai_generated");
  assert.equal(inferOrigin({ digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia" }), "ai_edited");
  assert.equal(inferOrigin({ software: "Adobe Photoshop 26.1", make: "Canon" }), "edited");
  assert.equal(inferOrigin({ make: "Apple" }), "camera");
  assert.equal(inferOrigin({}), "unknown");
  assert.match(aiDisclosure("ai_generated")!, /AI-generated/);
  assert.equal(aiDisclosure("camera"), null);
});

test("near-duplicates group by how few bits their look-hashes differ", () => {
  assert.equal(hamming("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(hamming("0000000000000000", "000000000000000f"), 4);
  assert.equal(hamming("0000000000000000", "ffffffffffffffff"), 64);
  const groups = duplicateGroups([
    { id: "a", phash: "00000000000000ff" }, { id: "b", phash: "00000000000000f0" }, { id: "c", phash: "ffffffff00000000" }, { id: "d", phash: null },
  ]);
  assert.deepEqual(groups.map((g) => g.map((x) => x.id)), [["a", "b"]]);
});

import { captionText } from "../../src/lib/assets/core";
test("caption files become plain words", () => {
  assert.equal(captionText("WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Ana>Welcome to the <b>panel</b>.\n\n2\n00:00:04.000 --> 00:00:06.000\nThanks all."), "Welcome to the panel. Thanks all.");
});

import { postChecks } from "../../src/lib/assets/core";
test("post checks catch length, hashtags, placeholders, consent and AI disclosure", () => {
  const clear = { consent: "given", people: "Ana", expiresAt: null, origin: "camera" };
  assert.ok(postChecks("Great panel today. #BioHubNet", clear).every((c) => c.ok));
  const bad = postChecks("TBD " + "#a ".repeat(6), { ...clear, consent: "unknown", origin: "ai_generated" });
  assert.deepEqual(bad.map((c) => c.ok), [true, false, false, false, false]);
  assert.equal(postChecks("An AI-generated illustration of our lab.", { ...clear, origin: "ai_generated" }).at(-1)!.ok, true);
});
