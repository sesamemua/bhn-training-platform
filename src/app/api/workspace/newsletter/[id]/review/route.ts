import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openTeamRound } from "@/lib/page-review/open-team-round";
import { visibleTeamRound } from "@/lib/page-review/team-round";

export const dynamic = "force-dynamic";

const Schema = z.object({
  action: z.enum(["open", "revise", "release", "next"]),
  html: z.string().trim().min(1).max(1_000_000),
  round: z.number().int().positive().optional(),
  teamRound: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide newsletter HTML and a valid revision." }, { status: 400 });
  const { id } = await ctx.params;
  const issue = await prisma.newsletterIssue.findUnique({ where: { id }, select: { title: true, status: true } });
  if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });

  // One stable review per issue, including after a revision or simultaneous first opens.
  const reviewId = `newsletter-${id}`;
  if (parsed.data.action === "open") {
    const token = randomBytes(16).toString("base64url");
    const review = await prisma.$transaction(async (tx) => {
      const existing = await tx.pageReview.findUnique({ where: { id: reviewId }, select: { id: true } });
      const saved = await tx.pageReview.upsert({
        where: { id: reviewId },
        update: {},
        create: {
          id: reviewId, kind: "paste", title: issue.title,
          pastedHtml: parsed.data.html, url: `/review-paste/${token}`, shareToken: token, status: "pending",
          createdById: (session.user as { id?: string }).id ?? null,
        },
        select: { id: true, round: true, teamRound: true, status: true, pastedHtml: true },
      });
      if (!existing && issue.status !== "sent") {
        await tx.newsletterIssue.update({
          where: { id }, data: { renderedHtml: saved.pastedHtml, renderedAt: new Date() },
        });
      }
      return { id: saved.id, round: saved.round, teamRound: visibleTeamRound(saved), status: saved.status };
    });
    return NextResponse.json({ ok: true, review });
  }

  const current = await prisma.pageReview.findUnique({ where: { id: reviewId } });
  if (!current) return NextResponse.json({ error: "Open the review first." }, { status: 404 });
  if (current.status === "closed") return NextResponse.json({ error: "This review is closed." }, { status: 409 });
  if (parsed.data.action === "next" || parsed.data.action === "release") {
    const actor = session.user as { id?: string; name?: string };
    if (!actor.id) return NextResponse.json({ error: "Staff sign-in is required." }, { status: 403 });
    if (issue.status === "sent") return NextResponse.json({ error: "This newsletter has already been sent." }, { status: 409 });
    if (parsed.data.round !== current.round || current.pastedHtml !== parsed.data.html) return NextResponse.json({ error: "Save your draft changes and reload before opening team review." }, { status: 409 });
    if (parsed.data.action === "release" && current.status === "open") return NextResponse.json({ ok: true, review: { id: current.id, round: current.round, teamRound: visibleTeamRound(current), status: "open" } });
    if (parsed.data.action === "release" && current.status !== "pending" || parsed.data.action === "next" && !["open", "exported"].includes(current.status)) return NextResponse.json({ error: "Open the current draft for team review first." }, { status: 409 });
    const review = await prisma.$transaction(tx => openTeamRound(tx, current, { id: actor.id!, name: actor.name ?? "Staff editor" }, current.round, parsed.data.teamRound ?? (parsed.data.action === "release" ? 0 : -1)));
    if (!review) return NextResponse.json({ error: "The review changed. Reload before opening team review." }, { status: 409 });
    return NextResponse.json({ ok: true, review });
  }
  if (current.pastedHtml === parsed.data.html) {
    return NextResponse.json({ ok: true, unchanged: true, review: { id: current.id, round: current.round, teamRound: visibleTeamRound(current), status: current.status } });
  }
  if (parsed.data.round !== current.round) return NextResponse.json({ error: "Another editor updated this review. Reload before saving." }, { status: 409 });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.pageReview.updateMany({
      where: { id: reviewId, round: current.round, status: current.status },
      data: {
        title: issue.title, pastedHtml: parsed.data.html,
        snapshotHtml: current.pastedHtml, snapshotAt: new Date(),
        round: { increment: 1 }, status: current.status,
      },
    });
    if (result.count && current.pastedHtml) {
      await tx.pageReviewVersion.upsert({
        where: { reviewId_round: { reviewId, round: current.round } },
        create: { reviewId, round: current.round, html: current.pastedHtml }, update: {},
      });
    }
    if (result.count && issue.status !== "sent") {
      await tx.newsletterIssue.update({
        where: { id }, data: { renderedHtml: parsed.data.html, renderedAt: new Date() },
      });
    }
    return result;
  });
  if (!updated.count) return NextResponse.json({ error: "Another editor updated this review. Reload before saving." }, { status: 409 });
  // Open threads carry forward; a new version does not mean the feedback was addressed.
  const status = current.status;
  return NextResponse.json({ ok: true, review: { id: reviewId, round: current.round + 1, teamRound: visibleTeamRound(current), status } });
}
