import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const draft = z.object({
  round: z.number().int().min(1).max(2147483647),
  target: z.string().min(1).max(1600),
  baseline: z.string().regex(/^[a-f0-9]{64}$/),
  body: z.string().max(30000),
}).strict();
const remove = z.object({ etag: z.string().uuid() }).strict();
type Checkpoint = z.infer<typeof draft> & { etag: string };

export const checkpointHeaders = {
  "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400",
};
export const checkpointResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: checkpointHeaders });

export async function textCheckpoint(request: Request, review: { id: string; round: number; status: string }, owner: string) {
  if (review.status !== "open") return checkpointResponse({ error: "This review is no longer open." }, 409);
  if (request.method === "GET") {
    const [result] = await prisma.$queryRaw<Checkpoint[]>`
      SELECT "round", "target", "baseline", "body", "etag" FROM "PageReviewTextCheckpoint"
        WHERE "reviewId" = ${review.id} AND "owner" = ${owner}
          AND "round" = ${review.round} AND "updatedAt" >= now() - interval '7 days'
    `;
    return checkpointResponse({ ok: true, draft: result ?? null });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return checkpointResponse({ error: "Use JSON." }, 415);
  const raw = await request.text();
  if (raw.length > 185000) return checkpointResponse({ error: "This draft is too long." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return checkpointResponse({ error: "Invalid draft." }, 400); }
  if (request.method === "DELETE") {
    const result = remove.safeParse(body);
    if (!result.success) return checkpointResponse({ error: "Invalid checkpoint ID." }, 400);
    await prisma.$executeRaw`DELETE FROM "PageReviewTextCheckpoint"
      WHERE "reviewId" = ${review.id} AND "owner" = ${owner} AND "etag" = ${result.data.etag}`;
    return checkpointResponse({ ok: true });
  }
  const result = draft.safeParse(body);
  if (!result.success) return checkpointResponse({ error: "Invalid draft." }, 400);
  const { round, target, baseline, body: text } = result.data;
  if (round !== review.round) return checkpointResponse({ error: "A newer review round is available." }, 409);
  const etag = randomUUID();
  const written = await prisma.$executeRaw`
    INSERT INTO "PageReviewTextCheckpoint" ("reviewId", "owner", "round", "target", "baseline", "body", "etag")
    SELECT "id", ${owner}, "round", ${target}, ${baseline}, ${text}, ${etag} FROM "PageReview"
      WHERE "id" = ${review.id} AND "round" = ${round} AND "status" = 'open'
    ON CONFLICT ("reviewId", "owner") DO UPDATE
      SET "round" = EXCLUDED."round", "target" = EXCLUDED."target", "baseline" = EXCLUDED."baseline",
          "body" = EXCLUDED."body", "etag" = EXCLUDED."etag", "updatedAt" = now()
      WHERE "PageReviewTextCheckpoint"."round" <= EXCLUDED."round"
  `;
  return written ? checkpointResponse({ ok: true, etag }) : checkpointResponse({ error: "The review changed." }, 409);
}
