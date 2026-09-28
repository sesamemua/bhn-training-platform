import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { editSocialPost } from "../../src/lib/social/edit";
import { withSocialTags } from "../../src/lib/social/tags";
import type { SavedSocialText } from "../../src/lib/social/edit-history";

test("inline edits track authors, preserve untracked mode, and reject stale saves", async () => {
  let post: SavedSocialText = { id: "post-1", body: withSocialTags("Original post."), status: "approved", editVersion: 0, trackChanges: true };
  const audits: Prisma.AuditLogUncheckedCreateInput[] = [];
  let written: Prisma.SocialPostUncheckedUpdateManyInput | undefined;
  let raced = false;
  const tx = {
    socialPost: {
      findUnique: async () => ({ ...post }),
      updateMany: async ({ where, data }: Prisma.SocialPostUpdateManyArgs) => {
        assert.equal(where?.editVersion, post.editVersion);
        assert.equal(where?.body, post.body);
        assert.equal(where?.status, post.status);
        if (raced) return { count: 0 };
        written = data;
        post = { ...post, body: data.body as string, status: (data.status ?? post.status) as string, trackChanges: data.trackChanges as boolean, editVersion: post.editVersion + 1 };
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) => {
        audits.push(data);
        return { id: `change-${audits.length}`, createdAt: new Date("2026-09-27T12:00:00Z"), actor: { name: "Editor" } };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const save = (body: string, trackChanges = true, expectedVersion = post.editVersion) =>
    editSocialPost(tx, "editor-id", { id: post.id, body, trackChanges, expectedVersion });

  const original = post.body;
  const edited = await save("Updated post.");
  assert.equal(edited.status, 200);
  assert.equal(post.status, "draft");
  assert.equal(written?.approvedAt, null);
  assert.equal(written?.approvedById, null);
  assert.equal(edited.result.change?.author, "Editor");
  assert.equal(audits[0].actorId, "editor-id");
  assert.deepEqual(JSON.parse(audits[0].detail as string), { before: original, after: withSocialTags("Updated post."), version: 1 });

  assert.equal((await save("Stale overwrite", true, 0)).status, 409);
  assert.equal(post.body, withSocialTags("Updated post."));
  raced = true;
  assert.equal((await save("Racing overwrite")).status, 409);
  raced = false;
  assert.equal(audits.length, 1);

  post.status = "approved";
  assert.equal((await save(post.body, false)).status, 200);
  assert.equal(post.status, "approved");
  assert.equal(post.trackChanges, false);
  await save("Untracked edit", false);
  assert.equal(post.status, "draft");
  assert.equal(audits.length, 1);
  const version = post.editVersion;
  await save(post.body, false);
  assert.equal(post.editVersion, version);
  assert.equal((await save("   ")).status, 400);
  assert.equal((await save("x".repeat(6001))).status, 400);
  assert.equal(post.editVersion, version);

  await save("Tracked again", true);
  assert.equal(audits.length, 2);
  assert.equal(JSON.parse(audits[1].detail as string).before, withSocialTags("Untracked edit"));
  for (const status of ["published", "skipped"]) {
    post.status = status;
    assert.equal((await save("Should not save")).status, 409);
  }
  assert.equal(audits.length, 2);
});
