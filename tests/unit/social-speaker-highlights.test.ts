import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { renderSpeakerGraphic } from "../../src/app/api/admin/social/posts/[id]/image/route";
import {
  draftSpeakerPost, speakerPostKey, syncSpeakerHighlights,
  SYMPOSIUM_REGISTRATION_URL,
  type HighlightSpeaker,
} from "../../src/lib/social/speakers";

const speaker: HighlightSpeaker = {
  id: "speaker-1",
  fullName: "Alex Chen",
  title: "Director of Training",
  organization: "Example Labs",
  bio: "Alex leads applied bioprocess training. Their work connects researchers with industry practice.",
  photoUrl: "https://example.r2.dev/alex.jpg",
  sessionTitle: "Building practical skills",
};

test("speaker highlight uses submitted facts and the live registration link", () => {
  const body = draftSpeakerPost(speaker);
  assert.match(body, /Alex Chen, Director of Training at Example Labs/);
  assert.match(body, /Building practical skills/);
  assert.match(body, /applied bioprocess training/);
  assert.ok(body.includes(SYMPOSIUM_REGISTRATION_URL));
  assert.ok(!body.includes(speaker.photoUrl!));
});

test("only speakers with both a bio and headshot become drafts", async () => {
  let created: Record<string, unknown>[] = [];
  const prisma = {
    socialPost: {
      createMany: async ({ data, skipDuplicates }: { data: Record<string, unknown>[]; skipDuplicates: boolean }) => {
        assert.equal(skipDuplicates, true);
        created = data;
        return { count: data.length };
      },
    },
  } as unknown as PrismaClient;
  const count = await syncSpeakerHighlights(prisma, [
    speaker,
    { ...speaker, id: "missing-photo", photoUrl: null },
    { ...speaker, id: "missing-bio", bio: null },
  ], new Date("2026-09-27T12:00:00Z"));
  assert.equal(count, 1);
  assert.equal(created[0].key, speakerPostKey(speaker.id));
  assert.equal(created[0].status, undefined);
  assert.deepEqual(created[0].assetSpec, { version: 1, template: "symposium-speaker" });
});

test("speaker graphic renders a downloadable square PNG with the BioHubNet logo", async () => {
  const logo = `data:image/png;base64,${(await readFile("public/biohubnet-logo.png")).toString("base64")}`;
  const response = renderSpeakerGraphic({
    logo,
    photo: logo,
    fullName: speaker.fullName,
    title: speaker.title,
    organization: speaker.organization,
    id: speaker.id,
    download: true,
  });
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 1200);
});
