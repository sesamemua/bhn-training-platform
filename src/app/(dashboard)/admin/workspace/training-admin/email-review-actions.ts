"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentSignature, mailConfigured, sendMail } from "@/lib/mail";
import { parseOverrides, resolveTemplates, TEMPLATES_KEY } from "@/lib/allocation/email-templates";
import { newsletterReviewTeam } from "@/lib/newsletter/review-invites";
import { SESSIONS } from "@/lib/training-week/schedule-2026";
import { buildTrainingEmailReview, trainingEmailReviewId, trainingEmailReviewLink, type TrainingEmailReviewBundle } from "@/lib/training-week/email-review";

const EventId = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const SaveInput = z.object({ eventId: EventId, round: z.number().int().positive().optional() });
const InviteInput = SaveInput.extend({ round: z.number().int().positive(), userIds: z.array(z.string().min(1).max(150)).min(1).max(5) });
type Result = { ok: true; bundle: TrainingEmailReviewBundle } | { ok: false; error: string };

async function preview(eventId: string) {
  const [event, saved, signature] = await Promise.all([
    prisma.bhnEvent.findUnique({ where: { id: eventId }, select: { workshops: {
      where: { isActive: true, slug: { in: SESSIONS.map((session) => session.slug) } },
      select: { slug: true, title: true, startDateTime: true, endDateTime: true, locationName: true },
    } } }),
    prisma.platformSetting.findUnique({ where: { key: TEMPLATES_KEY }, select: { value: true } }),
    currentSignature(),
  ]);
  if (!event?.workshops.length) return null;
  return buildTrainingEmailReview(event.workshops, resolveTemplates(parseOverrides(saved?.value)), signature);
}

export async function loadTrainingEmailReview(eventId: string): Promise<Result> {
  if (!await requireRole("admin").catch(() => null)) return { ok: false, error: "Admin access required." };
  if (!EventId.safeParse(eventId).success) return { ok: false, error: "Invalid Training Week event." };
  const content = await preview(eventId);
  if (!content) return { ok: false, error: "No Training Week workshops found." };
  const review = await prisma.pageReview.findUnique({ where: { id: trainingEmailReviewId(eventId) }, select: { id: true, round: true, status: true, pastedHtml: true } });
  return { ok: true, bundle: {
    review: review ? { id: review.id, round: review.round, status: review.status } : null,
    emailCount: content.emailCount, workshopCount: content.workshopCount, issues: content.issues,
    stale: !!review && review.pastedHtml !== content.html,
  } };
}

export async function saveTrainingEmailReview(input: unknown): Promise<Result> {
  const session = await requireRole("admin").catch(() => null);
  const actor = session?.user as { id?: string } | undefined;
  if (!actor?.id) return { ok: false, error: "Admin access required." };
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid event and revision." };
  const { eventId, round } = parsed.data;
  const content = await preview(eventId);
  if (!content) return { ok: false, error: "No Training Week workshops found." };
  if (content.html.length > 1_000_000) return { ok: false, error: "The email review is too large." };
  const id = trainingEmailReviewId(eventId);
  const current = await prisma.pageReview.findUnique({ where: { id } });
  if (!current) {
    const token = randomBytes(16).toString("base64url");
    await prisma.pageReview.upsert({ where: { id }, update: {}, create: {
      id, title: "Training Week 2026 · Check-in emails", kind: "paste", pastedHtml: content.html,
      url: `/review-paste/${token}`, shareToken: token, createdById: actor.id,
    } });
  } else {
    if (current.status === "closed") return { ok: false, error: "This review is closed. Reopen it in Website Review first." };
    if (current.pastedHtml !== content.html) {
      if (round !== current.round) return { ok: false, error: "Another editor updated this review. Refresh before saving." };
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.pageReview.updateMany({ where: { id, round, status: { not: "closed" } }, data: {
          pastedHtml: content.html, snapshotHtml: current.pastedHtml, snapshotAt: new Date(), round: { increment: 1 }, status: "open",
        } });
        if (changed.count && current.pastedHtml) await tx.pageReviewVersion.upsert({
          where: { reviewId_round: { reviewId: id, round: current.round } },
          create: { reviewId: id, round: current.round, html: current.pastedHtml }, update: {},
        });
        return changed;
      });
      if (!updated.count) return { ok: false, error: "Another editor updated this review. Refresh before saving." };
    }
  }
  return loadTrainingEmailReview(eventId);
}

export async function sendTrainingEmailReviewInvites(input: unknown): Promise<{ sent: string[]; error?: string }> {
  const session = await requireRole("admin").catch(() => null);
  const actor = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!actor?.id) return { sent: [], error: "Admin access required." };
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return { sent: [], error: "Choose a valid review round and up to five colleagues." };
  const { eventId, round } = parsed.data;
  const ids = [...new Set(parsed.data.userIds)];
  const team = await newsletterReviewTeam();
  const allowed = new Set(team.groups.flatMap((group) => group.userIds));
  if (ids.some((id) => !allowed.has(id))) return { sent: [], error: "Choose active colleagues from the review groups." };
  const loaded = await loadTrainingEmailReview(eventId);
  if (!loaded.ok) return { sent: [], error: loaded.error };
  const { review, stale } = loaded.bundle;
  if (!review || review.status !== "open") return { sent: [], error: "Open an active email review first." };
  if (review.round !== round || stale) return { sent: [], error: "The emails changed. Save the latest revision before requesting review." };
  if (!mailConfigured()) return { sent: [], error: "Email is not configured. Copy the review link instead." };
  const colleagues = await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, role: { in: ["instructor", "admin", "superadmin"] } },
    select: { id: true, name: true, email: true },
  });
  if (colleagues.length !== ids.length) return { sent: [], error: "A colleague's account is unavailable. Refresh the review groups." };
  const link = `${(process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app").replace(/\/$/, "")}${trainingEmailReviewLink(eventId)}`;
  const sender = (actor.name || "A BioHubNet colleague").replace(/[\r\n]+/g, " ");
  const sent: string[] = [];
  for (const colleague of colleagues) {
    try {
      await sendMail({
        to: colleague.email, subject: `${sender} requested your review: Training Week check-in emails · Round ${round}`,
        text: `Hello ${colleague.name || "there"},\n\n${sender} would like you to review the Training Week check-in emails (round ${round}).\n\n${loaded.bundle.emailCount} email previews cover ${loaded.bundle.workshopCount} workshops, with their saved times and locations. Please check the wording and logistics.\n\n${link}\n\nSign in with your training platform account to leave comments and replies. The link stays the same through revisions. This is an internal review request, not an attendee email.`,
        replyTo: actor.email ?? undefined,
        log: { kind: "training_week.email_review.invite", byName: actor.name },
      });
      sent.push(colleague.id);
      await prisma.auditLog.create({ data: {
        actorId: actor.id, action: "training_week.email_review.invite", targetType: "pageReview", targetId: review.id,
        detail: JSON.stringify({ recipientId: colleague.id, round }),
      } }).catch((error) => console.error("Training email review invitation audit failed", error));
    } catch (error) { console.error("Training email review invitation failed", error); }
  }
  return { sent, error: sent.length !== ids.length ? "Some requests could not be sent. Retry only the unsent colleagues." : undefined };
}
