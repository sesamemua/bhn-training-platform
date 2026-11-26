import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { visibleTeamRound, versionsSeparateFromTeamRounds, type TeamRoundState } from "./team-round";

type Review = TeamRoundState & { round: number; title: string; kind: string; pastedHtml: string | null };

/** Transactional, explicit action. Neither content, version history, nor comments are mutated. */
export async function openTeamRound(
  tx: Pick<Prisma.TransactionClient, "pageReview" | "reviewFeedbackMemory">,
  review: Review,
  actor: { id: string; name: string },
  expectedVersion: number,
  expectedTeamRound: number,
) {
  if (!versionsSeparateFromTeamRounds(review.id) || !review.pastedHtml || !["open", "pending", "exported"].includes(review.status) ||
      expectedVersion !== review.round || expectedTeamRound !== (visibleTeamRound(review) ?? 0)) return null;
  const teamRound = expectedTeamRound + 1;
  const started = new Date();
  const applied = await tx.pageReview.updateMany({
    where: { id: review.id, round: expectedVersion, status: review.status, teamRound: review.teamRound ?? null },
    data: { teamRound, teamRoundStartedAt: started, status: "open" },
  });
  if (!applied.count) return null;
  const by = { ...actor, verified: true };
  const id = "team-review-open:" + randomUUID();
  const time = started.toISOString();
  await tx.reviewFeedbackMemory.create({ data: {
    id, reviewId: review.id, occurredAt: started, event: "created",
    detail: JSON.stringify({
      schema: 1, event: "created", signal: "activity", recordedAt: time, occurredAt: time,
      source: { model: "PageReview", id: review.id, action: "opened team review", context: { teamRound, savedVersion: review.round } },
      review: { id: review.id, title: review.title, url: "", kind: review.kind, round: teamRound, revision: createHash("sha256").update(review.pastedHtml).digest("hex") },
      comment: { id, body: "Opened team review round " + teamRound, round: teamRound, editCount: 0, parentId: null, createdAt: time,
        authorName: actor.name, authorUserId: actor.id, authorKind: "user", status: "open", editedAt: null, editedById: null,
        editedByName: null, anchorQuote: null, anchorPath: null, anchorBlock: null, anchorKey: null },
      writer: by, actor: by,
    }),
  } });
  return { id: review.id, round: review.round, teamRound, status: "open" };
}
