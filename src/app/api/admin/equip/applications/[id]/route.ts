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

  type EquipStatus,
  type EquipStream,
  type ApplicationStage,
  type EquipDocument,
  type VentureLiftReviewerScores,
} from "@/lib/equip/types";
import { templateMilestones } from "@/lib/equip/milestones";
import {
  priorApprovalsWhere, capStateFrom, checkApproval, varianceOf, totalVariance,
} from "@/lib/equip/cap";
import { canDelete } from "@/lib/equip/delete";
import { purgeApplication } from "@/lib/equip/purge";

export const runtime = "nodejs";

const TARGET_STATUSES = new Set<EquipStatus>([
  "under_review",
  "info_requested",
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
  /*
   * Everything the reviewer needs to decide, in one shape: both caps,
   * what has been approved, what was actually spent where that is known,
   * and the per-application trail behind it.
   */
  let fundingHistory: ReturnType<typeof capStateFrom> & {
    variance: ReturnType<typeof totalVariance>;
    thisApplication: ReturnType<typeof varianceOf>;
  } | null = null;

  if (app.stream === "venture_connect") {
    const prior = await prisma.equipApplication.findMany({
      where: priorApprovalsWhere(app),
      select: {
        id: true, status: true, requestedAmount: true, approvedAmount: true,
        actualAmount: true, decidedAt: true,
      },
      orderBy: { decidedAt: "asc" },
    });
    fundingHistory = {
      ...capStateFrom(prior),
      variance: totalVariance(prior),
      thisApplication: varianceOf(app),
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
  /* Reconciliation. `null` is meaningful and distinct from absent: it
     clears a figure entered by mistake, where absent means "not part of
     this request". */
  const actualAmount =
    body.actualAmount === null ? null
    : typeof body.actualAmount === "number" ? body.actualAmount
    : undefined;
  const actualNote = (body.actualNote as string | undefined)?.slice(0, 2000);
  const reviewerScores = body.reviewerScores as VentureLiftReviewerScores | undefined;
  /* Reversing an approval that has money against it releases that
     amount back into the applicant's cap — same "say so on purpose"
     rule as deleting one (canDelete, cap.ts). */
  const confirmReversal = body.confirmReversal === true;

  /*
   * Reconciliation is not a state transition.
   *
   * An actual figure arrives with receipts, weeks after the decision and
   * usually on an application that is already `approved` or `funded`.
   * Re-sending its own status to carry the number would hit the
   * "Already decided" guard below and 409 — so a PATCH with no status
   * and a reconciliation field is a distinct, valid request.
   */
  const reconcileOnly =
    !target && (actualAmount !== undefined || actualNote !== undefined);

  if (!reconcileOnly && (!target || !TARGET_STATUSES.has(target))) {
    return NextResponse.json({ error: "Invalid target status" }, { status: 400 });
  }

  // Sending an application back has to say what for — a blank "more
  // info requested" leaves the applicant with nothing to act on.
  if (target === "info_requested" && !reviewerNote) {
    return NextResponse.json(
      { error: "Say what's needed — the applicant only sees this note." },
      { status: 400 },
    );
  }

  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: {
      id: true, userId: true, applicantEmail: true, status: true, requestedAmount: true,
      approvedAmount: true, actualAmount: true,
      stream: true, applicationStage: true, documents: true, milestones: true,
    },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reconciliation-only: write the figure and stop. No status change, no
  // state machine, no cap re-check — the money was already committed
  // when it was approved, and recording what was spent cannot exceed it.
  if (reconcileOnly) {
    const patch: Record<string, unknown> = { reviewerId };
    if (actualAmount !== undefined) {
      patch.actualAmount = actualAmount;
      patch.actualAt = actualAmount === null ? null : new Date();
    }
    if (actualNote !== undefined) patch.actualNote = actualNote || null;
    const updated = await prisma.equipApplication.update({ where: { id }, data: patch });
    return NextResponse.json({ application: updated });
  }

  // Past the reconciliation branch a status is required, and saying so
  // here is what lets the rest of the handler treat it as defined.
  if (!target) {
    return NextResponse.json({ error: "Invalid target status" }, { status: 400 });
  }

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

  /*
   * Both VentureConnect caps, server-side.
   *
   * The dollar cap was already here; the application-count cap was not,
   * so an applicant could be approved a fourth and a fifth time for
   * small amounts and never trip anything. Both are checked in one place
   * now, and the slot check reports first — telling somebody at three
   * awards that "$3,500 remains" is a near-miss that is simply false.
   *
   * This runs even when no approvedAmount is supplied. The old guard was
   * conditioned on `typeof approvedAmount === "number"`, which meant an
   * approval sent without an amount skipped the cap entirely.
   */
  /*
   * The amount that will actually be written, which is not always the
   * one that was sent. Approving without an explicit figure falls back
   * to requestedAmount below, so checking the cap against the SENT
   * value let an approval through at 0 and then wrote the full request.
   * An applicant with $500 of headroom could be approved for $2,000 by
   * a reviewer who simply did not touch the amount field.
   *
   * The rule has to be evaluated on the same number the write uses.
   */
  const effectiveApproval =
    typeof approvedAmount === "number" && approvedAmount > 0
      ? approvedAmount
      : (app.requestedAmount ?? 0);

  if (target === "approved" && app.stream === "venture_connect") {
    const prior = await prisma.equipApplication.findMany({
      where: priorApprovalsWhere(app),
      select: {
        id: true, status: true, requestedAmount: true, approvedAmount: true,
        actualAmount: true, decidedAt: true,
      },
    });
    const block = checkApproval(capStateFrom(prior), effectiveApproval);
    if (block) return NextResponse.json({ error: block.message }, { status: 400 });
  }

  // State-machine guard. Once terminal (approved/rejected/funded), only
  // two legs are allowed out of "approved": forward to funded, or back
  // to under_review (an admin undoing the approval). Every other
  // terminal status (funded, rejected, pre_screen_rejected) stays a
  // dead end — reachable only through delete, never through a further
  // decision.
  const isFundingLeg = app.status === "approved" && target === "funded";
  const isReversalLeg = app.status === "approved" && target === "under_review";
  if (isTerminal(app.status as EquipStatus) && !isFundingLeg && !isReversalLeg) {
    return NextResponse.json({ error: "Already decided" }, { status: 409 });
  }

  // A reversal that releases money needs the same explicit confirm a
  // cap-affecting delete does — stated with the dollar figure, so it is
  // a decision made on purpose rather than a click that happens to
  // change what the applicant can still be given.
  if (isReversalLeg && (app.approvedAmount ?? 0) > 0 && !confirmReversal) {
    return NextResponse.json(
      {
        error:
          `This application has $${(app.approvedAmount ?? 0).toLocaleString()} approved against it. ` +
          "Reversing the approval returns that amount to the applicant's $5,000 allowance. " +
          "Confirm if that is what you intend.",
        needsConfirm: true,
      },
      { status: 400 },
    );
  }

  // Build the patch.
  const now = new Date();
  const data: Record<string, unknown> = { status: target, reviewerId };

  /*
   * Reconciliation is independent of the status change: an actual figure
   * arrives when receipts do, which is usually well after the decision
   * and often on an application that is already `funded`. Handled before
   * the status branches so it applies to whichever leg is being run.
   */
  if (actualAmount !== undefined) {
    data.actualAmount = actualAmount;
    data.actualAt = actualAmount === null ? null : now;
  }
  if (actualNote !== undefined) data.actualNote = actualNote || null;

  if (target === "under_review") {
    data.reviewedAt = now;
    if (isReversalLeg) {
      // Undo the approval, not just the status label — decidedAt and
      // approvedAmount are what the cap sums over (priorApprovalsWhere,
      // cap.ts) and what canFund reads to know there is money to
      // disburse. Leaving either set would let the application still
      // count toward the cap, or still show a Mark Funded button, on a
      // row that is no longer approved.
      data.decidedAt = null;
      data.approvedAmount = null;
      if (reviewerNote) data.reviewerNote = reviewerNote;
    }
    // Plain claim (submitted → under_review) — nothing else to touch,
    // there was no prior decision to undo.
  }
  if (target === "info_requested") {
    // Not a decision — decidedAt stays untouched (there isn't one yet).
    // reviewerNote is the note the applicant will read; required above.
    data.reviewedAt = now;
    data.reviewerNote = reviewerNote;
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

  // No email fires here. A decision only ever updates the record —
  // the applicant is told about it when a human explicitly reviews and
  // sends the matching email from the review page (POST
  // .../send-email), never as a side effect of clicking Approve /
  // Reject / Fund / etc. The one automatic email in the whole EQUIP
  // lifecycle is the submission-received confirmation
  // (submit/route.ts), which just acknowledges receipt and carries no
  // decision content.
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
