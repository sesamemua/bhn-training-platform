"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";

const TEAM_ROLES = ["instructor", "admin", "superadmin"];
const Input = z.object({ issueId: z.string().min(1).max(150), userIds: z.array(z.string().min(1).max(150)).min(1).max(20) });

export async function newsletterReviewTeam() {
  if (!await requireRole("instructor").catch(() => null)) return { error: "Forbidden", colleagues: [] };
  const colleagues = await prisma.user.findMany({
    where: { role: { in: TEAM_ROLES }, isActive: true },
    orderBy: [{ name: "asc" }, { email: "asc" }], select: { id: true, name: true, email: true },
  });
  return { colleagues };
}

export async function sendNewsletterReviewInvites(input: unknown) {
  const session = await requireRole("instructor").catch(() => null);
  const actor = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!actor?.id) return { error: "Forbidden", sent: [] as string[] };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: "Choose up to 20 colleagues.", sent: [] as string[] };
  const { issueId } = parsed.data;
  const userIds = [...new Set(parsed.data.userIds)];
  const issue = await prisma.newsletterIssue.findUnique({ where: { id: issueId }, select: { title: true } });
  const review = await prisma.pageReview.findUnique({ where: { id: `newsletter-${issueId}` }, select: { status: true } });
  if (!issue || !review) return { error: "Start this issue's review before sending a link.", sent: [] as string[] };
  if (review.status === "closed") return { error: "This review is closed.", sent: [] as string[] };
  const colleagues = await prisma.user.findMany({
    where: { id: { in: userIds }, role: { in: TEAM_ROLES }, isActive: true },
    select: { id: true, name: true, email: true },
  });
  if (colleagues.length !== userIds.length) return { error: "Choose active colleagues from the team list.", sent: [] as string[] };
  if (!mailConfigured()) return { error: "Email is not configured. Copy the review link instead.", sent: [] as string[] };
  const link = `${(process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "")}/admin/workspace/marketing/newsletter/review?issue=${encodeURIComponent(issueId)}`;
  const sender = actor.name || "A BioHubNet colleague";
  const sent: string[] = [];
  for (const who of colleagues) {
    try {
      await sendMail({
        to: who.email!, subject: `${sender} requested your review: ${issue.title}`.replace(/[\r\n]+/g, " "),
        text: `Hello ${who.name || "there"},\n\n${sender} would like you to review ${issue.title}.\n\n${link}\n\nSign in with your training platform account, then open the full-page review to leave comments. This link stays the same through revisions.`,
        replyTo: actor.email ?? undefined,
      });
      sent.push(who.id);
      await prisma.auditLog.create({ data: {
        actorId: actor.id, action: "newsletter.review.invite", targetType: "newsletterIssue", targetId: issueId,
        detail: JSON.stringify({ recipientId: who.id, recipientEmail: who.email }),
      } }).catch((error) => console.error("Newsletter review invite audit failed", error));
    } catch (error) { console.error("Newsletter review invitation failed", error); }
  }
  return { sent, error: sent.length < colleagues.length ? "Some invitations could not be sent. Only unsent recipients remain selected." : undefined };
}
