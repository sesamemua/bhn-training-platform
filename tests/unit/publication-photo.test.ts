import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
const url = new URL("../fixtures/publication-r2.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/r2") return { url, shortCircuit: true };
  return next(specifier, context);
} });
const modulePromise = import("../../src/lib/events/publication-photo").finally(() => hooks.deregister());
const writes: { key: string; bytes: Buffer; mime: string }[] = [];
Reflect.set(globalThis, "publicationImageWrites", writes);
test("image sources reject arbitrary hosts, spoofed prefixes, credentials, ports and redirects", async (t) => {
  const { publicationPhotoSource, freezePublicationPhoto } = await modulePromise;
  for (const value of ["http://images.example.org/speakers/a.png", "https://images.example.org.evil.test/a.png", "https://127.0.0.1/a.png", "https://user:pass@images.example.org/a.png", "https://images.example.org:444/a.png", "https://biohubnet.ca/private/a.png"]) assert.throws(() => publicationPhotoSource(value));
  assert.ok(publicationPhotoSource("https://biohubnet.ca/wp-content/uploads/2026/a.png"));
  assert.throws(() => publicationPhotoSource("https://images.example.org/applications/private-document.png"));
  t.mock.method(globalThis, "fetch", async (_url, init) => { assert.equal(init.redirect, "error"); throw new Error("Redirect refused"); });
  await assert.rejects(freezePublicationPhoto("https://images.example.org/speakers/a.png"), /Redirect/);
});
test("immutable content hashes preserve old image bytes when source photos change", async (t) => {
  const { freezePublicationPhoto } = await modulePromise;
  const image1 = Buffer.from([255,216,255,1,2,3,4,5,6,7,8,9]);
  const image2 = Buffer.from([255,216,255,9,8,7,6,5,4,3,2,1]);
  let bytes = image1;
  t.mock.method(globalThis, "fetch", async () => new Response(bytes));
  const first = await freezePublicationPhoto("https://images.example.org/speakers/a.jpg");
  bytes = image2;
  const second = await freezePublicationPhoto("https://images.example.org/speakers/a.jpg");
  assert.notEqual(first, second);
  assert.match(first!, /people-publication\/2026-annual-symposium\/[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(writes[0].bytes, image1);
  assert.equal(await freezePublicationPhoto(null), null);
});
test("image copy refuses oversized bodies, HTML and SVG masquerading as images", async (t) => {
  const { publicationImageType, freezePublicationPhoto } = await modulePromise;
  assert.throws(() => publicationImageType(Buffer.from("<svg>not an image</svg>")));
  t.mock.method(globalThis, "fetch", async () => new Response("x", { headers: { "content-length": "6000000" } }));
  await assert.rejects(freezePublicationPhoto("https://images.example.org/speakers/a.jpg"), /5 MB/);
});
