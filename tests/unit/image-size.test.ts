/** Reading an image's size from its header. */
import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { imageSize } from "../../src/lib/images/size";
import { qrPng } from "../../src/lib/training-week/pass-qr";

test("a PNG's size comes from its header; anything else unknown is null", () => {
  const png = qrPng("hello", 4, 4);
  const s = imageSize(png)!;
  assert.equal(s.type, "image/png");
  assert.equal(s.w, s.h);
  assert.ok(s.w > 40);
  assert.equal(imageSize(Buffer.from("not an image at all, just words")), null);
  void deflateSync;
});

test("a GIF and a JPEG frame header", () => {
  const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00, 0, 0]);
  assert.deepEqual(imageSize(gif), { w: 320, h: 240, type: "image/gif" });
  // SOI, an APP0 of length 16, then SOF0 with height 600 and width 800.
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0]);
  assert.deepEqual(imageSize(jpg), { w: 800, h: 600, type: "image/jpeg" });
});
