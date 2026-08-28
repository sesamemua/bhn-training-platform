/**
 * Admin-side single Equip application.
 *
 *   GET   /api/admin/equip/applications/[id]   → full app for review
 *   PATCH /api/admin/equip/applications/[id]   → record a decision
 *                                                 or update status
 *
 * Decision flow
 *   submitted → under_review     (reviewer claims it)
 *   under_review → approved      (with approvedAmount + note)
 *   under_review → rejected      (with note)
 *   approved → funded            (with disbursementNote)
 *
 * Every decision stamps reviewer, reviewedAt, and (for funded)
 * fundedAt. Mirrors the /api/admin/credit-applications PATCH
 * shape so this code path is familiar to anyone who's reviewed
 * credit apps before.
 */
import { NextResponse } from "next/server";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import {
  isTerminal,
  STREAM_BUDGETS,
  type EquipStatus,
  type EquipStream,
  type ApplicationStage,
  type EquipDocument,
  type VentureLiftReviewerScores,
} from "@/lib/equip/types";
import { templateMilestones } from "@/lib/equip/milestones";
import { buildEquipStatusEmail } from "@/lib/equip/emails";
import { sendMail, mailConfigured } from "@/lib/mail";
import { applicantOf } from "@/lib/equip/applicant";
import { priorApprovalsWhere } from "@/lib/equip/cap";
import { canDelete } from "@/lib/equip/delete";
import { purgeApplication } from "@/lib/equip/purge";

export const runtime = "nodejs";

const TARGET_STATUSES = new Set<EquipStatus>([
  "under_review",
  "approved", "rejected", "funded",
  // VL pre-screening outcomes
  "pre_screen_approved", "pre_screen_rejected",
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]);
  const { id } = await params;
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    include: {
      user:     { select: { id: true, name: true, email: true, organization: true, jobTitle: true } },
      reviewer: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Per-PDF rule: "The maximum total funding available per
  // company is $5,000 CAD" for VentureConnect (across up to 3
  // separate applications). We approximate "company" as
  // applicant (User) since most cases are one trainee = one
  // company; admins handle multi-trainee company cases manually
  // by reading the companyName field on each app.
  let fundingHistory: {
    cap: number;
    previouslyApproved: number;
    remaining: number;
    countedApplications: { id: string; status: string; amount: number; decidedAt: Date | null }[];
  } | null = null;
  if (app.stream === "venture_connect") {
    const cap = STREAM_BUDGETS.venture_connect;
    const prior = await prisma.equipApplication.findMany({
      where: priorApprovalsWhere(app),
      select: { id: true, status: true, approvedAmount: true, decidedAt: true },
    });
    const previouslyApproved = prior.reduce<number>((s, p) => s + (p.approvedAmount ?? 0), 0);
    fundingHistory = {
      cap,
      previouslyApproved,
      remaining: Math.max(0, cap - previouslyApproved),
      countedApplications: prior.map((p) => ({
        id: p.id,
        status: p.status,
        amount: p.approvedAmount ?? 0,
        decidedAt: p.decidedAt,
      })),
    };
  }

  return NextResponse.json({ application: app, fundingHistory });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]);
  const reviewerId = (session?.user as { id?: string })?.id;
  if (!reviewerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const target = body.status as EquipStatus | undefined;
  const reviewerNote = (body.reviewerNote as string | undefined)?.slice(0, 4000);
  const approvedAmount = typeof body.approvedAmount === "number" ? body.approvedAmount : undefined;
  const disbursementNote = (body.disbursementNote as string | undefined)?.slice(0, 2000);
  const reviewerScores = body.reviewerScores as VentureLiftReviewerScores | undefined;

  if (!target || !TARGET_STATUSES.has(target)) {
    return NextResponse.json({ error: "Invalid target status" }, { status: 400 });
  }

  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: {
      id: true, userId: true, applicantEmail: true, status: true, requestedAmount: true,
      stream: true, applicationStage: true, documents: true, milestones: true,
    },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // VL Stage-2 eligibility gate. Approving a VentureLift full
  // application requires Appendix 3 (IP supporting documents) —
  // per the Reviewer Guide, a filed provisional patent is the
  // minimum. The client disables the approve button when this
  // isn't satisfied; this is the server-side safety net so an
  // out-of-date page can't slip past the rule.
  if (
    target === "approved" &&
    app.stream === "venture_lift" &&
    (app.applicationStage as ApplicationStage) === "full_app"
  ) {
    const docs = (app.documents as unknown as EquipDocument[]) ?? [];
    const hasIpAppendix = docs.some((d) => d.kind === "ip_doc");
    if (!hasIpAppendix) {
      return NextResponse.json(
        { error: "Eligibility gate: Appendix 3 (IP supporting documents) is missing. The Reviewer Guide requires a provisional patent or stronger IP evidence before approval." },
        { status: 400 },
      );
    }
  }

  // Per-applicant cumulative VC cap enforcement.
  if (target === "approved" && app.stream === "venture_connect" && typeof approvedAmount === "number") {
    const prior = await prisma.equipApplication.aggregate({
      where: priorApprovalsWhere(app),
      _sum: { approvedAmount: true },
    });
    const previouslyApproved = prior._sum.approvedAmount ?? 0;
    const remaining = STREAM_BUDGETS.venture_connect - previouslyApproved;
    if (approvedAmount > remaining) {
      return NextResponse.json(
        {
          error: `Approval would exceed the per-applicant $${STREAM_BUDGETS.venture_connect.toLocaleString()} cap. Applicant has $${previouslyApproved.toLocaleString()} previously approved on VentureConnect — only $${remaining.toLocaleString()} remains.`,
        },
        { status: 400 },
      );
    }
  }

  // State-machine guard. Once terminal (approved/rejected/funded),
  // only the approved → funded leg is allowed.
  if (isTerminal(app.status as EquipStatus)) {
    const isFundingLeg = app.status === "approved" && target === "funded";
    if (!isFundingLeg) {
      return NextResponse.json({ error: "Already decided" }, { status: 409 });
    }
  }

  // Build the patch.
  const now = new Date();
  const data: Record<string, unknown> = { status: target, reviewerId };

  if (target === "under_review") {
    // Soft claim — record reviewer, no decision yet.
    data.reviewedAt = now;
  }
  if (target === "approved") {
    data.decidedAt = now;
    data.reviewedAt = now;
    if (typeof approvedAmount === "number" && approvedAmount > 0) {
      data.approvedAmount = approvedAmount;
    } else if (app.requestedAmount) {
      // Default to the requested amount when reviewer doesn't
      // override. Saves a click.
      data.approvedAmount = app.requestedAmount;
    }
    if (reviewerNote) data.reviewerNote = reviewerNote;
    // VL Stage-2 carries a 6-criterion rubric. Save it on the
    // reviewerScores JSON column for later display + analytics.
    if (reviewerScores && typeof reviewerScores === "object") {
      data.reviewerScores = reviewerScores;
    }
  }
  if (target === "rejected") {
    data.decidedAt = now;
    data.reviewedAt = now;
    data.approvedAmount = null;
    if (reviewerNote) data.reviewerNote = reviewerNote;
  }
  // VL Stage-1 outcomes — pre-screening decisions. We stamp
  // preScreenDecidedAt + preScreenReviewerNote and leave the
  // Stage-2 columns (decidedAt, approvedAmount, reviewerScores)
  // untouched. The applicant page auto-advances applicationStage
  // to "full_app" once they open the editor after approval.
  if (target === "pre_screen_approved") {
    data.reviewedAt = now;
    data.preScreenDecidedAt = now;
    if (reviewerNote) data.preScreenReviewerNote = reviewerNote;
  }
  if (target === "pre_screen_rejected") {
    data.reviewedAt = now;
    data.preScreenDecidedAt = now;
    data.decidedAt = now;
    if (reviewerNote) data.preScreenReviewerNote = reviewerNote;
  }
  if (target === "funded") {
    data.fundedAt = now;
    if (disbursementNote) data.disbursementNote = disbursementNote;
    // Template the post-funding milestones if there aren't any yet.
    // (Re-funding an already-funded app is gated above, so this is
    // strictly first-time-funded territory.)
    const existing = Array.isArray(app.milestones) ? (app.milestones as unknown[]) : [];
    if (existing.length === 0) {
      data.milestones = templateMilestones(app.stream as EquipStream, now) as unknown as object;
    }
  }

  const updated = await prisma.equipApplication.update({
    where: { id },
    data,
    include: {
      user:     { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });

  // Notify the applicant of the decision. Best-effort: a mail failure must
  // never roll back or 500 a recorded decision. (under_review/approved/
  // rejected/funded + the two VL pre-screen outcomes each map to a template.)
  const notify = applicantOf(updated);
  if (mailConfigured() && notify.email) {
    const email = await buildEquipStatusEmail(target, {
      applicantName: notify.name,
      stream: app.stream as EquipStream,
      stage: app.applicationStage as ApplicationStage,
      requestedAmount: app.requestedAmount,
      approvedAmount: typeof data.approvedAmount === "number" ? data.approvedAmount : undefined,
      reviewerNote: reviewerNote ?? null,
      disbursementNote: disbursementNote ?? null,
    });
    if (email) {
      try {
        await sendMail({ to: notify.email, subject: email.subject, text: email.text, html: email.html });
      } catch (err) {
        console.error("[equip] decision email failed", { id, target, err });
      }
    }
  }

  return NextResponse.json({ ok: true, application: updated });
}

/**
 * DELETE /api/admin/equip/applications/[id]?confirm=1
 *
 * An admin removing an application entirely, and the files attached to
 * it. The confirm flag is required only where it changes something
 * beyond this row: deleting an APPROVED application returns its amount
 * to the applicant's $5,000 allowance, because that cap is a live sum
 * over surviving rows rather than a stored total. canDelete decides;
 * this just carries out the answer.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Same gate the other verbs on this route use.
  const access = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: { id: true, status: true, approvedAmount: true, applicantEmail: true, userId: true },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const confirmed = new URL(req.url).searchParams.get("confirm") === "1";
  const verdict = canDelete(app, "admin", confirmed);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: verdict.reason, needsConfirm: verdict.needsConfirm, affectsCap: verdict.affectsCap },
      { status: 409 },
    );
  }

  const { files } = await purgeApplication(id);
  return NextResponse.json({ ok: true, files, affectsCap: verdict.affectsCap });
}
