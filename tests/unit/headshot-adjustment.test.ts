import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import sharp from "sharp";
// @ts-expect-error Runtime supports loader hooks ahead of the repo's Node typings.
import { registerHooks } from "node:module";
const PUBLICATION_KEY = "symposium2026.peoplePublication.v1";
const PEOPLE_PLAN_KEY = "symposium2026.peoplePlan.v1";

const origin = "https://platform.example.org";
const original = "https://images.example.org/speakers/original.png";
const person = { id: "melissa", fullName: "Melissa E Anders", title: "Coach", organization: "Example", bio: "Private planning note", email: "", source: "paste", session: "networking", linkedSpeakerId: "speaker", ignoredSpeakerIds: [], archived: false };
const initialSpeaker = { id: "speaker", fullName: person.fullName, title: person.title, organization: person.organization, photoUrl: original, submittedAt: new Date("2026-10-19T20:53:53Z"), eventId: "event" };
let speaker = { ...initialSpeaker };
type Row = { key: string; value: string; updatedAt: Date };
let settings = new Map<string, Row>();
let failAudit = false, race = false;
const audits: { data: { detail: string } }[] = [];
const uploads: { key: string; bytes: Buffer }[] = [], deletes: string[] = [];
Reflect.set(globalThis, "headshotUploads", uploads); Reflect.set(globalThis, "headshotDeletes", deletes);
const setting = {
  findUnique: async ({ where }: { where: { key: string } }) => settings.get(where.key) ?? null,
  create: async ({ data }: { data: Row }) => { if (settings.has(data.key)) throw Object.assign(new Error("Duplicate"), { code: "P2002" }); settings.set(data.key, data); return data; },
  updateMany: async ({ where, data }: { where: Row; data: Omit<Row, "key"> }) => {
    const old = settings.get(where.key);
    if (race || old?.value !== where.value || old.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
    settings.set(where.key, { ...old, ...data }); return { count: 1 };
  },
};
const fake = {
  platformSetting: setting,
  speaker: {
    findFirst: async ({ where }: { where: { id: string; event?: { slug: string } } }) => where.id === speaker.id && (!where.event || where.event.slug === "2026-annual-symposium") ? { ...speaker } : null,
    updateMany: async ({ where, data }: { where: { id: string; photoUrl: string }; data: { photoUrl: string } }) => {
      if (race || where.id !== speaker.id || where.photoUrl !== speaker.photoUrl) return { count: 0 };
      Object.assign(speaker, data); return { count: 1 };
    },
  },
  bhnEvent: { findUnique: async ({ where }: { where: { slug: string } }) => where.slug === "2026-annual-symposium" ? { speakers: [{ ...speaker }] } : null },
  $transaction: async (fn: (tx: unknown) => Promise<void>) => {
    const before = new Map(settings), beforeSpeaker = { ...speaker };
    try { await fn({ platformSetting: setting, speaker: fake.speaker, auditLog: { create: async (entry: typeof audits[number]) => { if (failAudit) throw new Error("Audit failed"); audits.push(entry); } } }); }
    catch (e) { settings = before; speaker = beforeSpeaker; throw e; }
  },
};
Reflect.set(globalThis, "prisma", fake);
const authUrl = new URL("../fixtures/people-route-auth.cjs", import.meta.url).href;
const r2Url = new URL("../fixtures/headshot-r2.cjs", import.meta.url).href;
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/lib/auth") return { url: authUrl, shortCircuit: true };
  if (specifier === "@/lib/r2") return { url: r2Url, shortCircuit: true };
  return next(specifier, context);
} });
const route = import("../../src/app/api/admin/events/[slug]/headshot/route").finally(() => hooks.deregister());
const ctx = { params: Promise.resolve({ slug: "2026-annual-symposium" }) };
const endpoint = `${origin}/api/admin/events/2026-annual-symposium/headshot`;
const png = sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).png().toBuffer();
async function request({ version = speaker.photoUrl, image, source = origin, target = "speakerId=speaker", framing = { zoom: 0.9, x: 30, y: 0 }, originalFile }: { version?: string; image?: Uint8Array; source?: string | null; target?: string; framing?: unknown; originalFile?: Blob } = {}) {
  const form = new FormData();
  form.set("headshot", new Blob([new Uint8Array(image ?? await png)], { type: "image/png" }), "headshot.png");
  form.set("version", version); form.set("framing", JSON.stringify(framing));
  if (originalFile) form.set("original", originalFile, "original.jpg");
  return new NextRequest(`${endpoint}?${target}`, { method: "POST", headers: source ? { origin: source } : {}, body: form });
}
function reset() {
  speaker = { ...initialSpeaker }; settings.clear(); audits.length = uploads.length = deletes.length = 0; race = failAudit = false;
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  settings.set(PEOPLE_PLAN_KEY, { key: PEOPLE_PLAN_KEY, updatedAt: new Date(), value: JSON.stringify({ people: [person] }) });
  settings.set(PUBLICATION_KEY, { key: PUBLICATION_KEY, updatedAt: new Date(), value: JSON.stringify({ initialized: true, revision: 3, updatedAt: new Date().toISOString(), drafts: [], approved: [{ id: person.id, sourceSubmissionId: speaker.id, approvedRevision: 3, profile: { fullName: person.fullName, title: person.title, organization: person.organization, bio: "Public biography", photoUrl: original, linkedinUrl: null, links: [], placements: [{ sessionId: "networking", order: 4 }] } }] }) });
}

test("headshot adjustment requires admin, same origin, valid target, PNG and framing", async () => {
  const { POST, GET } = await route; reset();
  Reflect.set(globalThis, "peopleActor", null);
  assert.equal((await POST(await request(), ctx)).status, 403);
  assert.equal((await GET(new NextRequest(`${endpoint}?speakerId=speaker`), ctx)).status, 403);
  Reflect.set(globalThis, "peopleActor", { user: { id: "admin" } });
  assert.equal((await POST(await request({ source: null }), ctx)).status, 403);
  assert.equal((await POST(await request({ source: "https://evil.example" }), ctx)).status, 403);
  assert.equal((await POST(await request({ target: "speakerId=missing" }), ctx)).status, 404);
  assert.equal((await POST(await request({ target: "speakerId=speaker&personId=melissa" }), ctx)).status, 400);
  assert.equal((await POST(await request({ image: new TextEncoder().encode("not a png") }), ctx)).status, 400);
  assert.equal((await POST(await request({ framing: { zoom: 5, x: 0, y: 0 } }), ctx)).status, 400);
  assert.equal(uploads.length, 0);
});

test("saving through the planner preserves original bytes, bio and placements and audits the crop", async () => {
  const { POST } = await route; reset();
  const response = await POST(await request({ target: "personId=melissa" }), ctx);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const { photoUrl } = await response.json();
  assert.equal(speaker.photoUrl, photoUrl);
  const saved = JSON.parse(settings.get("headshot.crop.speaker.speaker")!.value);
  assert.equal(saved.originalUrl, original); assert.equal(saved.currentUrl, photoUrl);
  assert.deepEqual(uploads[0].bytes, await png);
  assert.deepEqual(deletes, []);
  const pub = JSON.parse(settings.get(PUBLICATION_KEY)!.value);
  assert.equal(pub.revision, 4); assert.equal(pub.approved[0].profile.photoUrl, photoUrl);
  assert.equal(pub.approved[0].profile.bio, "Public biography");
  assert.deepEqual(pub.approved[0].profile.placements, [{ sessionId: "networking", order: 4 }]);
  assert.equal(JSON.parse(audits[0].data.detail).original, original);
  assert.equal(JSON.parse(settings.get(PEOPLE_PLAN_KEY)!.value).people[0].bio, "Private planning note");
});

test("repeated adjustments use the first original and new submissions start a fresh original", async () => {
  const { POST } = await route; reset();
  assert.equal((await POST(await request(), ctx)).status, 200);
  assert.equal((await POST(await request(), ctx)).status, 200);
  assert.equal(JSON.parse(settings.get("headshot.crop.speaker.speaker")!.value).originalUrl, original);
  speaker.photoUrl = "https://images.example.org/speakers/new-original.png";
  assert.equal((await POST(await request(), ctx)).status, 200);
  assert.equal(JSON.parse(settings.get("headshot.crop.speaker.speaker")!.value).originalUrl, "https://images.example.org/speakers/new-original.png");
  assert.equal(deletes.length, 0);
});

test("stale editors, concurrent writes and audit failures cannot partially save", async () => {
  const { POST } = await route; reset();
  assert.equal((await POST(await request({ version: "https://images.example.org/old.png" }), ctx)).status, 409);
  assert.equal(uploads.length, 0);
  for (const failure of ["race", "audit"]) {
    const before = JSON.stringify([...settings]);
    race = failure === "race"; failAudit = failure === "audit";
    assert.equal((await POST(await request(), ctx)).status, race ? 409 : 500);
    assert.equal(JSON.stringify([...settings]), before);
    assert.equal(speaker.photoUrl, original);
    assert.ok(deletes.at(-1)?.includes("people-publication/headshots/"));
    assert.ok(!deletes.includes(original));
  }
});

test("the editor loads the preserved original, not the adjusted image, without redirects or caching", async () => {
  const { POST, GET } = await route; reset();
  await POST(await request(), ctx);
  const realFetch = globalThis.fetch;
  const fetched: string[] = [];
  globalThis.fetch = async (input, init) => {
    fetched.push(String(input)); assert.equal(init?.redirect, "error");
    return new Response(new Uint8Array(await png));
  };
  try {
    const response = await GET(new NextRequest(`${endpoint}?speakerId=speaker`), ctx);
    assert.equal(response.status, 200);
    assert.deepEqual(fetched, [original]);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(decodeURIComponent(response.headers.get("x-headshot-version")!), speaker.photoUrl);
    assert.deepEqual(JSON.parse(response.headers.get("x-headshot-framing")!), { zoom: 0.9, x: 30, y: 0 });
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await png);
  } finally { globalThis.fetch = realFetch; }
});

test("historical profiles can be framed without a submission; unpublished people stay unpublished", async () => {
  const { POST } = await route; reset();
  const raw = settings.get(PEOPLE_PLAN_KEY)!;
  raw.value = JSON.stringify({ people: [{ ...person, fullName: "Historical Person", linkedSpeakerId: null, photoUrl: original }] });
  const publication = settings.get(PUBLICATION_KEY)!;
  const state = JSON.parse(publication.value); state.approved = []; publication.value = JSON.stringify(state);
  const response = await POST(await request({ target: "personId=melissa" }), ctx);
  assert.equal(response.status, 200);
  const { photoUrl } = await response.json();
  assert.equal(JSON.parse(settings.get(PEOPLE_PLAN_KEY)!.value).people.find((p: { id: string }) => p.id === "melissa").photoUrl, photoUrl);
  assert.equal(JSON.parse(settings.get("headshot.crop.person.melissa")!.value).originalUrl, original);
  assert.equal(settings.get(PUBLICATION_KEY)!.value, publication.value);
  assert.equal(speaker.photoUrl, original);
});

test("speaker IDs cannot escape their event", async () => {
  const { POST } = await route; reset();
  assert.equal((await POST(await request(), { params: Promise.resolve({ slug: "another-event" }) })).status, 404);
  assert.equal(uploads.length, 0);
});

test("replacing a photo retains the complete new original byte-for-byte and never deletes old originals", async () => {
  const { POST } = await route; reset();
  const jpeg = await sharp({ create: { width: 800, height: 1200, channels: 3, background: "silver" } }).jpeg().toBuffer();
  const response = await POST(await request({ originalFile: new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }) }), ctx);
  assert.equal(response.status, 200);
  const saved = JSON.parse(settings.get("headshot.crop.speaker.speaker")!.value);
  assert.match(saved.originalUrl, /headshot-originals\/.+\.jpg$/);
  assert.deepEqual(uploads[0].bytes, jpeg);
  assert.deepEqual(uploads[1].bytes, await png);
  assert.deepEqual(deletes, []);
  assert.equal(JSON.parse(audits[0].data.detail).previousOriginal, original);
  assert.equal((await POST(await request(), ctx)).status, 200);
  assert.equal(JSON.parse(settings.get("headshot.crop.speaker.speaker")!.value).originalUrl, saved.originalUrl);
});

test("replacement validation blocks oversized photos, SVG and invalid image bytes before storage", async () => {
  const { POST } = await route; reset();
  for (const file of [new Blob([new Uint8Array(2_000_001)]), new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: "image/jpeg" }), new Blob([new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0])], { type: "image/jpeg" })]) {
    assert.equal((await POST(await request({ originalFile: file }), ctx)).status, 400);
  }
  assert.equal(uploads.length, 0);
  assert.equal(speaker.photoUrl, original);
});

test("failed replacement transaction cleans up only its two new uploads", async () => {
  const { POST } = await route; reset(); failAudit = true;
  const jpeg = await sharp({ create: { width: 800, height: 1200, channels: 3, background: "silver" } }).jpeg().toBuffer();
  assert.equal((await POST(await request({ originalFile: new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }) }), ctx)).status, 500);
  assert.equal(speaker.photoUrl, original);
  assert.equal(deletes.length, 2);
  assert.ok(deletes.every((url) => url.startsWith("https://images.example.org/people-publication/")));
  assert.ok(!settings.has("headshot.crop.speaker.speaker"));
});
