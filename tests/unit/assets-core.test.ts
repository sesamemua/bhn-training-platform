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
