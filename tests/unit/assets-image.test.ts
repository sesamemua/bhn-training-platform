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

import { lookHash, readProvenance } from "../../src/lib/assets/image";
import { hamming, inferOrigin } from "../../src/lib/assets/core";

test("provenance keeps camera and software, flags AI source types, never GPS", async () => {
  const camera = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#888" } })
    .withExif({ IFD0: { Make: "Canon", Model: "EOS R6", Software: "Adobe Photoshop 26.1" }, IFD3: { GPSLatitudeRef: "N" } }).jpeg().toBuffer();
  const p = await readProvenance(camera);
  assert.equal(p.make, "Canon"); assert.equal(p.model, "EOS R6"); assert.match(p.software!, /Photoshop/);
  assert.equal(inferOrigin(p), "edited");
  assert.ok(!JSON.stringify(p).includes("GPS"));
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></rdf:RDF></x:xmpmeta>`;
  const ai = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#888" } }).withXmp(xmp).png().toBuffer();
  assert.equal(inferOrigin(await readProvenance(ai)), "ai_generated");
});

test("look-alike hash: a resized copy is a near-duplicate, a different picture isn't", async () => {
  const draw = (w: number, h: number, flip = false) => sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><rect x="${flip ? w / 2 : 0}" width="${w / 2}" height="${h}" fill="#000"/></svg>`) }]).png().toBuffer();
  const a = await lookHash(await draw(400, 300)), b = await lookHash(await draw(200, 150)), c = await lookHash(await draw(400, 300, true));
  assert.ok(hamming(a, b) <= 8, `resized copy differs by ${hamming(a, b)} bits`);
  assert.ok(hamming(a, c) > 8, `mirror image differs by only ${hamming(a, c)} bits`);
});
