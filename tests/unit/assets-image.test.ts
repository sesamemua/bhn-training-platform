import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { processImage } from "../../src/lib/assets/image";

test("uploads are turned upright and lose camera and GPS metadata", async () => {
  // A 40×20 JPEG flagged "rotate 90°", carrying EXIF with a GPS position.
  const input = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#2f6fd0" } })
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "43/1 39/1 0/1" } })
    .jpeg().toBuffer();
  const before = await sharp(input).metadata();
  assert.ok(before.exif && before.orientation === 6, "fixture carries EXIF and a rotate-90 flag");
  const out = await processImage(input, "image/jpeg");
  const meta = await sharp(out.bytes).metadata();
  assert.equal(meta.exif, undefined, "EXIF (and its GPS block) is gone");
  assert.equal(out.width, 20); assert.equal(out.height, 40); // rotated upright
  assert.match(out.color!, /^#[0-9a-f]{6}$/);
  assert.match(out.blur!, /^data:image\/webp;base64,/);
  assert.equal((await sharp(out.thumb).metadata()).format, "webp");
});

test("a file that isn't the picture type it claims is refused", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(processImage(png, "image/jpeg"), /not the picture type/);
  await assert.rejects(processImage(Buffer.from("<html>"), "image/png"), /not the picture type/);
  await assert.rejects(processImage(png, "image/svg+xml"), /PNG, JPEG, WebP or GIF/);
});
