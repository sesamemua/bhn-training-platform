import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { REPORT_ID, reportSchema } from "@/lib/symposium-report/document";
import { reportBlocks } from "@/lib/symposium-report/paginate";
import { reportTransaction, reportRevision } from "@/lib/symposium-report/store";
import { fieldChanges, REPORT_EDIT_ACTION, reportChanges } from "@/lib/symposium-report/changes";
import { prisma } from "@/lib/prisma";

const expected = { revision: z.string().regex(/^[a-f0-9]{64}$/), round: z.number().int().positive() };
const input = z.discriminatedUnion("action", [
  z.object({ ...expected, action: z.literal("save"), report: reportSchema }),
  z.object({ ...expected, action: z.literal("advance") }),
  z.object({ ...expected, action: z.literal("approve") }),
]);
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const session = await requireRole("instructor").catch(() => null);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return failure("Forbidden.", 403);
  const actorId = user.id;
  if (!req.headers.get("content-type")?.startsWith("application/json")) return failure("Expected JSON.", 415);
  const raw = await req.text();
  if (raw.length > 550_000) return failure("The report is too large.", 413);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return failure("Invalid JSON.", 400); }
  const parsed = input.safeParse(json);
  if (!parsed.success) return failure("Check the page titles, text lengths and number of pages.", 400);

  const data = parsed.data;
  if (data.action !== "save" && user.role !== "admin" && user.role !== "superadmin") {
    return failure("An administrator manages review rounds.", 403);
  }
  return reportTransaction(async (tx) => {
    const review = await tx.pageReview.findUnique({ where: { id: REPORT_ID, kind: "report" } });
    if (!review?.pastedHtml) return failure("Report session not found.", 404);
    if (review.round !== data.round || reportRevision(review.pastedHtml) !== data.revision) {
      return failure("Someone saved a newer version or started another round. Your local edits are still here. Copy them before reloading.", 409);
    }
    if (data.action !== "advance" && review.status !== "open") return failure("This round is locked.", 409);

    if (data.action === "save") {
      const photos = [data.report.cover.photo, ...data.report.pages.flatMap((page) => Object.values(page.photos ?? {}))];
      const files = [...new Set(photos.flatMap((photo) => photo ? [photo.file] : []))];
      if (files.length && await tx.symposiumReportAsset.count({ where: { name: { in: files } } }) !== files.length) {
        return failure("One of the selected photographs is no longer available. Choose a replacement.", 409);
      }
      const text = JSON.stringify(data.report);
      await tx.pageReview.update({ where: { id: REPORT_ID }, data: { pastedHtml: text } });
      // Track changes: who changed which text, before → after, in this round.
      const previous = reportSchema.safeParse(JSON.parse(review.pastedHtml));
      const changes = previous.success ? fieldChanges(previous.data, data.report) : [];
      if (changes.length) await tx.auditLog.create({ data: {
        actorId, action: REPORT_EDIT_ACTION, targetType: "pageReview", targetId: REPORT_ID,
        detail: JSON.stringify({ round: review.round, changes }),
      } });
      return NextResponse.json({ revision: reportRevision(text) });
    }
    if (data.action === "approve") {
      const doc = reportSchema.parse(JSON.parse(review.pastedHtml));
      if (doc.pages.some((page) => reportBlocks(page.text).some((block) => block.kind === "note"))) {
        return failure("Resolve the marked editorial notes in the report before approving it.", 409);
      }
      const open = await tx.pageComment.count({ where: { reviewId: REPORT_ID, parentId: null, status: "open" } });
      if (open) return failure("Settle all outstanding review threads before approving the report.", 409);
    }
    await tx.pageReviewVersion.upsert({
      where: { reviewId_round: { reviewId: REPORT_ID, round: review.round } },
      create: { reviewId: REPORT_ID, round: review.round, html: review.pastedHtml },
      update: {},
    });
    if (data.action === "advance") {
      await tx.pageComment.updateMany({ where: { reviewId: REPORT_ID, status: "open" }, data: { status: "resolved" } });
    }
    await tx.pageReview.update({
      where: { id: REPORT_ID },
      data: data.action === "approve" ? { status: "closed" } : { status: "open", round: { increment: 1 } },
    });
    return NextResponse.json({ ok: true });
  });
}

/** Track changes for the current round: the comparison text per field and who changed what. */
export async function GET() {
  const session = await requireRole("instructor").catch(() => null);
  if (!(session?.user as { id?: string } | undefined)?.id) return failure("Forbidden.", 403);
  const review = await prisma.pageReview.findUnique({ where: { id: REPORT_ID, kind: "report" }, select: { round: true } });
  if (!review) return failure("Report session not found.", 404);
  const [previous, logged] = await Promise.all([
    prisma.pageReviewVersion.findUnique({ where: { reviewId_round: { reviewId: REPORT_ID, round: review.round - 1 } }, select: { html: true } }),
    // ponytail: newest 300 saves of the round; page them if a round ever outgrows that.
    prisma.auditLog.findMany({
      where: { action: REPORT_EDIT_ACTION, targetType: "pageReview", targetId: REPORT_ID, detail: { contains: `"round":${review.round},` } },
      orderBy: { createdAt: "desc" }, take: 300,
      select: { id: true, createdAt: true, detail: true, actor: { select: { name: true, email: true } } },
    }),
  ]);
  const snapshot = previous ? reportSchema.safeParse(JSON.parse(previous.html)) : null;
  return NextResponse.json(reportChanges(review.round, snapshot?.success ? snapshot.data : null, logged));
}
