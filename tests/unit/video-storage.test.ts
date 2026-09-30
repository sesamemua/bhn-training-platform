import test from "node:test";
import assert from "node:assert/strict";
import { FORMATS, cheapestSet, mergeWindows, offloadPlan, rateMBs, setPrice } from "../../src/lib/video/storage";

const hq = FORMATS.find((f) => f.id === "og-hq")!;
// The BHN promo day: 9:30–10:30, 11:30–3:00, 4:00–5:00.
const day = [{ s: 570, e: 630 }, { s: 690, e: 780 }, { s: 780, e: 900 }, { s: 960, e: 1020 }];

test("scales ARRI's 25 fps rates", () => {
  assert.ok(Math.abs(rateMBs(hq, 25) - 153.25) < 0.01);
  assert.ok(Math.abs(rateMBs(hq, 23.976) - 146.97) < 0.1);
});
test("merges touching windows", () => {
  assert.deepEqual(mergeWindows(day), [{ s: 570, e: 630 }, { s: 690, e: 900 }, { s: 960, e: 1020 }]);
});
test("one mag: the camera stops mid-afternoon; two mags on an SSD: it never waits", () => {
  const rate = rateMBs(hq, 23.976);
  const one = offloadPlan({ windows: day, rate, roll: 0.75, mags: 1, dest: "ssd" });
  const two = offloadPlan({ windows: day, rate, roll: 0.75, mags: 2, dest: "ssd" });
  assert.ok(one.waitMin > 30);
  assert.ok(one.events.some((e) => e.kind === "stop"));
  assert.equal(two.waitMin, 0);
  assert.ok(Math.abs(two.footageGB - one.footageGB) < 1);
  assert.ok(two.footageGB / 1000 > 2);
});
test("a hard drive finishes the copies hours later than an SSD", () => {
  const rate = rateMBs(hq, 23.976);
  const ssd = offloadPlan({ windows: day, rate, roll: 0.75, mags: 2, dest: "ssd" });
  const hdd = offloadPlan({ windows: day, rate, roll: 0.75, mags: 2, dest: "hdd" });
  assert.ok(hdd.doneAt - ssd.doneAt > 120);
});
test("picks the cheapest drives the store has", () => {
  const set = cheapestSet(2.4, "ssd")!;
  assert.ok(set.reduce((s, x) => s + x.n * x.drive.tb, 0) >= 2.4);
  assert.equal(setPrice(set), 1154.98); // 1 TB + 2 TB beats one 4 TB
  assert.equal(cheapestSet(100, "hdd"), null);
});
