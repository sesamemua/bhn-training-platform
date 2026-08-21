import test from "node:test";
import assert from "node:assert/strict";
import { PER_HOUR, PER_SENDER, since, tooMany, WINDOW_MINUTES } from "../../src/lib/formbuilder/throttle";

test("a normal registration is not stopped", () => {
  assert.equal(tooMany({ byEmail: 0, total: 0 }), null);
  assert.equal(tooMany({ byEmail: PER_SENDER - 1, total: PER_HOUR - 1 }), null);
});

test("the same address filling it in over and over is stopped", () => {
  const why = tooMany({ byEmail: PER_SENDER, total: 5 });
  assert.ok(why);
  // And told what to do instead, or they will simply try again.
  assert.match(why, /reply to the confirmation email/i);
});

test("varying the address does not get past it", () => {
  // A per-sender rule alone is defeated by changing the email, which is
  // the first thing a script does.
  const why = tooMany({ byEmail: 0, total: PER_HOUR });
  assert.ok(why);
  assert.ok(!why.includes(String(PER_HOUR)), "the ceiling is not a number to aim at");
});

test("a burst that stops somebody says nothing they typed is lost", () => {
  assert.match(tooMany({ byEmail: 0, total: PER_HOUR })!, /nothing you typed has been lost/i);
});

test("the ceiling is well above a real burst", () => {
  // A link going to forty people at once is normal. Three hundred in an
  // hour is not.
  assert.ok(PER_HOUR >= 100, "a real launch would trip this");
  assert.ok(PER_SENDER >= 2, "one mistyped answer must not lock somebody out");
});

test("the window is an hour, measured backwards from now", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(since(now).toISOString(), "2026-10-01T11:00:00.000Z");
  assert.equal(WINDOW_MINUTES, 60);
});
