/** The perceptual focal point lands on the subject, not the middle of the frame. */
import test from "node:test";
import assert from "node:assert/strict";
import { focalPoint, offsetFor } from "../../src/lib/images/focal-point";

/** A w×h picture: flat background, with a disc of `fg` colour centred at (cx, cy) (0–1). */
function picture(w: number, h: number, bg: number[], fg: number[], cx: number, cy: number, r: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = Math.hypot(x / w - cx, y / h - cy) < r;
    const c = inside ? fg : bg;
    data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}

test("a face off to one side pulls the focus to it, and is seen as a person", () => {
  const f = focalPoint(picture(120, 80, [70, 90, 110], [224, 172, 140], 0.72, 0.35, 0.12));
  assert.ok(Math.abs(f.x - 0.72) < 0.08, `x ${f.x}`);
  assert.ok(Math.abs(f.y - 0.35) < 0.1, `y ${f.y}`);
  assert.equal(f.person, true);
});

test("a bright object on grey is the focus, not the centre; no person", () => {
  const f = focalPoint(picture(100, 100, [128, 128, 128], [20, 60, 220], 0.25, 0.7, 0.1));
  assert.ok(Math.abs(f.x - 0.25) < 0.1 && Math.abs(f.y - 0.7) < 0.1, `${f.x},${f.y}`);
  assert.equal(f.person, false);
});

test("the offset puts the focus at the centre (a little above for a person), never uncovering the frame", () => {
  // A 600×340 image in a 340 box: only horizontal room.
  const o = offsetFor({ x: 0.75, y: 0.3, person: false }, { w: 600, h: 340 }, 340);
  assert.equal(o.x, -130, "clamped to the image edge");
  assert.equal(o.y, 0);
  const p = offsetFor({ x: 0.5, y: 0.5, person: true }, { w: 340, h: 600 }, 340);
  assert.equal(p.x, 0);
  assert.ok(p.y < 0 && p.y >= -130, `${p.y}`);
});
