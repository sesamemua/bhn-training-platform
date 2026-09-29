/** The pass QR as a PNG: it has to be a real PNG, and it has to scan. */
import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { qrPng, withPassQr, PASS_QR_CID } from "../../src/lib/training-week/pass-qr";
import { passQrContent } from "../../src/lib/training-week/check-in";

const TOKEN = "pK3v9QxL2mWz7RtY4nBc0aHd";
const LINK = `https://bhn-training-platform.vercel.app/training-week/pass/${TOKEN}`;

/** Read our own greyscale PNG back into RGBA pixels — enough to scan it. */
function decode(png: Buffer): { width: number; height: number; rgba: Uint8ClampedArray } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature");
  let at = 8, width = 0, height = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * (width + 1)], 0, "filter byte");
    for (let x = 0; x < width; x++) {
      const g = raw[y * (width + 1) + 1 + x];
      rgba.set([g, g, g, 255], (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

test("the email PNG is a real PNG, and a scanner reads the pass code back from it", () => {
  const png = qrPng(passQrContent(TOKEN));
  const { width, height, rgba } = decode(png);
  assert.equal(width, height);
  const read = jsQR(rgba, width, height);
  assert.equal(read?.data, passQrContent(TOKEN));
});

test("the QR goes under the pass link, and nothing is added to a letter without one", () => {
  const text = `Hello Amara,\n\nYour pass:\n${LINK}\n\nSee you there.`;
  const out = withPassQr(text, LINK, TOKEN)!;
  assert.ok(out.html.includes(`src="cid:${PASS_QR_CID}"`));
  // The image sits after the link, not before it.
  assert.ok(out.html.indexOf(LINK) < out.html.indexOf("cid:"));
  assert.equal(out.attachment.cid, PASS_QR_CID);
  assert.equal(out.attachment.contentType, "image/png");
  assert.equal(withPassQr("Hello, no pass here.", LINK, TOKEN), null);
});

test("anything in the letter is escaped, not run", () => {
  const out = withPassQr(`<script>x</script>\n${LINK}`, LINK, TOKEN)!;
  assert.ok(!out.html.includes("<script>"));
  assert.ok(out.html.includes("&lt;script&gt;"));
});

test("one QR, under the pass link — not again under the \"I can't make it\" link that starts with it", () => {
  const text = `Your pass:\n${LINK}\n\nCan't make it?\n${LINK}/cant-attend/cmx7k2p9q000108l4a1b2c3d4`;
  const out = withPassQr(text, LINK, TOKEN)!;
  assert.equal(out.html.split(`cid:${PASS_QR_CID}`).length - 1, 1);
  assert.ok(out.html.indexOf("cid:") < out.html.indexOf("cant-attend"));
  // A letter with only the longer link has no pass link, so no QR.
  assert.equal(withPassQr(`Can't make it?\n${LINK}/cant-attend/x1`, LINK, TOKEN), null);
});
