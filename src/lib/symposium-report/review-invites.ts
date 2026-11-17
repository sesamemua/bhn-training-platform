"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REPORT_ID, REPORT_REVIEW_PATH } from "./document";
import { reportRevision } from "./store";
import { reviewInviteUserIds, sendStaffReviewInvites, staffReviewRecipients } from "@/lib/workspace-review-invites";

const inputSchema = z.object({
  round: z.number().int().positive(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  userIds: reviewInviteUserIds,
});

async function currentStaff() {
  const session = await requireRole("instructor").catch(() => null);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ? prisma.user.findFirst({
    where: { ...staffReviewRecipients, id },
    select: { id: true, name: true, email: true },
  }) : null;
}

export async function reportReviewRecipients() {
  if (!await currentStaff()) return { recipients: [], error: "Forbidden." };
  const users = await prisma.user.findMany({
    where: staffReviewRecipients,
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });
  return { recipients: users.map(({ id, name, email }) => ({ id, label: name || email })) };
}

export async function sendReportReviewInvites(input: unknown) {
  const actor = await currentStaff();
  if (!actor) return { error: "Forbidden.", sent: [] as string[] };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose up to 20 colleagues from the current draft.", sent: [] as string[] };
  const { round, revision, userIds } = parsed.data;
  const review = await prisma.pageReview.findUnique({
    where: { id: REPORT_ID, kind: "report" },
    select: { round: true, status: true, title: true, pastedHtml: true },
  });
  if (!review?.pastedHtml || review.status !== "open") {
    return { error: "Open a review round before sending invitations.", sent: [] as string[] };
  }
  if (review.round !== round || reportRevision(review.pastedHtml) !== revision) {
    return { error: "The shared draft has changed. Reload it before sending invitations.", sent: [] as string[] };
  }
  return sendStaffReviewInvites({
    actor, userIds, title: review.title, path: REPORT_REVIEW_PATH,
    instructions: `Round ${round} is open for feedback. Sign in with your BioHubNet staff account to leave comments in the report. The link opens the current shared draft.`,
    audit: { action: "symposium.report.review.invite", targetType: "pageReview", targetId: REPORT_ID, round },
  });
}

export type ReportInviteSent = { at: string; to: string; email: string; round: number | null; by: string };

/** Every review email sent for this report, newest first — read from the audit rows each send writes. */
export async function reportReviewHistory(): Promise<{ sent: ReportInviteSent[]; error?: string }> {
  if (!await currentStaff()) return { sent: [], error: "Forbidden." };
  // ponytail: last 200 sends; page it if a report ever goes past that.
  const rows = await prisma.auditLog.findMany({
    where: { action: "symposium.report.review.invite", targetType: "pageReview", targetId: REPORT_ID },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { createdAt: true, detail: true, actor: { select: { name: true, email: true } } },
  });
  const details = rows.map(({ detail }) => {
    try { return JSON.parse(detail ?? "{}") as { recipientId?: string; recipientEmail?: string; round?: number }; }
    catch { return {}; }
  });
  const ids = [...new Set(details.map((d) => d.recipientId).filter((id): id is string => !!id))];
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [])
    .map(({ id, name }) => [id, name]));
  return { sent: rows.map((row, i) => {
    const d = details[i];
    const email = d.recipientEmail ?? "";
    return {
      at: row.createdAt.toISOString(),
      to: (d.recipientId && names.get(d.recipientId)) || email || "Unknown recipient",
      email,
      round: typeof d.round === "number" ? d.round : null,
      by: row.actor.name || row.actor.email || "Unknown",
    };
  }) };
}
