/**
 * POST /api/equip/applications/[id]/submit
 *
 * Transitions an EquipApplication from "draft" to "submitted".
 * Validation rules match the BHN PDF requirements:
 *
 *   VentureConnect (EQUIP VentureConnect Grant Application Form,
 *   Mar 2026 PDF) — applicant info, company info, IP status,
 *   funding justification, $5,000 CAD budget cap, signature
 *   acknowledgement.
 *
 *   VentureLift pre-screening (v3 PDF) — applicant + PI info,
 *   IP status, 100-word Company Overview, 100-word Project
 *   Summary, all seven eligibility-checklist attestations.
 *
 * Idempotent: re-POSTing on an already-submitted app returns 200
 * with `{ ok: true, alreadySubmitted: true }`.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  STREAM_BUDGETS,
  wordCount,
  type EquipStream,
  type EquipStatus,
  type ApplicationStage,
  type VentureConnectFormData,
  type VentureLiftFormData,
  type VentureLiftFullData,
  type EquipDocument,
} from "@/lib/equip/types";
import { nextOpenDeadline } from "@/lib/equip/deadlines";
import { buildEquipSubmissionEmail } from "@/lib/equip/emails";
import { sendMail, mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";

const VC_BUDGET_KEYS: (keyof VentureConnectFormData)[] = [
  "budgetAirfare",
  "budgetTrainFare",
  "budgetRideshareTaxi",
  "budgetAccommodation",
  "budgetRegistration",
];

function sumVcBudget(f: VentureConnectFormData): number {
  return VC_BUDGET_KEYS.reduce<number>((s, k) => s + ((f[k] as number | undefined) ?? 0), 0);
}

/** Required fields + budget cap for VentureConnect. */
function validateVentureConnect(f: VentureConnectFormData): string[] {
  const errors: string[] = [];

  // Applicant
  if (!f.fullName?.trim())              errors.push("Applicant: Full Name is required");
  if (!f.institutionAffiliation?.trim()) errors.push("Applicant: Institution / Affiliation is required");
  if (!f.departmentProgram?.trim())     errors.push("Applicant: Department / Program is required");
  if (!f.currentRole)                   errors.push("Applicant: Current Role is required");
  if (!f.institutionEmail?.trim())      errors.push("Applicant: Institution Email is required");

  // Company
  if (!f.companyName?.trim())           errors.push("Company: Company Name is required");
  if (!f.ventureDescription || f.ventureDescription.trim().length < 30) {
    errors.push("Company: Venture description needs at least 30 characters");
  }

  // Funding justification
  if (!f.fundingJustification || f.fundingJustification.trim().length < 30) {
    errors.push("Funding Request Justification needs at least 30 characters");
  }

  /*
   * Event
   *
   * The paper form's own heading is "Event Information (Please Submit
   * One Event Only)", and the whole application is a request to attend
   * ONE named thing. Without these, an application could be submitted
   * with a budget and a justification and nothing saying what it is
   * for — which is not a form a reviewer can decide.
   */
  if (!f.eventCategory)         errors.push("Event: pick a category");
  if (!f.eventName?.trim())     errors.push("Event: Event Name is required");
  if (!f.eventLocation?.trim()) errors.push("Event: Location is required");
  if (!f.eventDates?.trim())    errors.push("Event: Dates are required");

  // Budget
  const total = sumVcBudget(f);
  if (total <= 0) errors.push("At least one budget line item must be set");
  if (total > STREAM_BUDGETS.venture_connect) {
    errors.push(`Total budget exceeds the $${STREAM_BUDGETS.venture_connect.toLocaleString()} CAD cap`);
  }

  // Signature attestation
  if (f.acknowledged !== true) errors.push("Signature: please tick the acknowledgement checkbox");
  if (!f.signaturePrintedName?.trim()) errors.push("Signature: Print Name is required");
  if (!f.signatureDate?.trim())        errors.push("Signature: Date is required");

  return errors;
}

/** Required fields + 100-word limits + full eligibility checklist
 *  for VentureLift pre-screening. */
function validateVentureLift(f: VentureLiftFormData): string[] {
  const errors: string[] = [];

  if (!f.companyName?.trim())   errors.push("Company: Company Name is required");

  // Applicant
  if (!f.fullName?.trim())                errors.push("Applicant: Full Name is required");
  if (!f.institutionAffiliation?.trim())  errors.push("Applicant: Institution / Affiliation is required");
  if (!f.departmentProgram?.trim())       errors.push("Applicant: Department / Program is required");
  if (!f.currentRole)                     errors.push("Applicant: Current Role is required");
  if (!f.institutionalEmail?.trim())      errors.push("Applicant: Institutional Email is required");
  if (!f.applicantTitleInCompany?.trim()) errors.push("Applicant: Title / Position in the Company is required");
  if (!f.applicantTimeCommitment?.trim()) errors.push("Applicant: Estimated time commitment is required");

  // PI
  if (!f.piFullName?.trim())                errors.push("PI: Full Name is required");
  if (!f.piInstitutionAffiliation?.trim())  errors.push("PI: Institution / Affiliation is required");
  if (!f.piDepartmentProgram?.trim())       errors.push("PI: Department / Program is required");
  if (!f.piInstitutionalEmail?.trim())      errors.push("PI: Institutional Email is required");

  // Word-limited fields
  if (!f.companyOverview?.trim()) errors.push("Company Overview is required");
  if (wordCount(f.companyOverview) > 100) errors.push("Company Overview exceeds the 100-word limit");

  if (!f.projectSummary?.trim()) errors.push("Project Summary is required");
  if (wordCount(f.projectSummary) > 100) errors.push("Project Summary exceeds the 100-word limit");

  // Eligibility checklist — all seven must be checked
  if (!f.eligibilityStemProfessional)             errors.push("Eligibility: STEM professional + leadership role attestation required");
  if (!f.eligibilityCanadianIp)                   errors.push("Eligibility: Canadian IP attestation required");
  if (!f.eligibilityHealthOutcomesBiomanufacturing) errors.push("Eligibility: Human health + biomanufacturing attestation required");
  if (!f.eligibilityAcceleratorParticipated)      errors.push("Eligibility: Accelerator participation attestation required");
  if (f.eligibilityAcceleratorParticipated && !f.acceleratorPrograms?.trim()) {
    errors.push("Eligibility: List the accelerator / incubator programs");
  }
  if (!f.eligibilityPreseedStageReady)            errors.push("Eligibility: Pre-seed / seed stage readiness attestation required");
  if (!f.eligibilityNoDuplicateFunding)           errors.push("Eligibility: No-duplicate-funding attestation required");
  if (!f.eligibilityPiHoldsFunds)                 errors.push("Eligibility: PI agrees to hold funds attestation required");

  // Signature
  if (!f.signaturePrintedName?.trim()) errors.push("Signature: Printed Name is required");
  if (!f.signatureDate?.trim())        errors.push("Signature: Date is required");

  return errors;
}

/** Required fields for VentureLift FULL (Stage 2) application.
 *  Mirrors the EQUIP VentureLift Grant Application Form
 *  (Oct 2025 PDF) — every starred prompt on the PDF is required,
 *  the budget cap is enforced, and the three signers must sign
 *  off. Appendix 3 (IP supporting documents) is the hard
 *  eligibility gate from the Evaluation Guide. */
function validateVentureLiftFull(f: VentureLiftFullData, docs: EquipDocument[]): string[] {
  const errors: string[] = [];

  if (!f.projectTitle?.trim()) errors.push("Project title is required");

  // Part 1.1 — Primary applicant
  if (!f.applicantFullName?.trim())        errors.push("Primary Applicant: Full Name is required");
  if (!f.applicantRole)                    errors.push("Primary Applicant: Current Role is required");
  if (!f.applicantInstitution?.trim())     errors.push("Primary Applicant: Institution / Affiliation is required");
  if (!f.applicantTitleInCompany?.trim())  errors.push("Primary Applicant: Title / Position in the Company is required");
  if (!f.applicantTimeCommitment?.trim())  errors.push("Primary Applicant: Time commitment is required");

  // Part 1.2 — PI
  if (!f.piFullName?.trim())               errors.push("PI: Full Name is required");
  if (!f.piInstitution?.trim())            errors.push("PI: Institution / Affiliation is required");
  if (!f.piRoleDescription?.trim())        errors.push("PI: Role description is required");

  // Part 1.3 — Company
  if (!f.companyName?.trim())              errors.push("Company: Name is required");
  if (!f.natureProduct && !f.natureService && !f.natureTechnologyPlatform) {
    errors.push("Company: Pick at least one nature (Product / Service / Technology)");
  }

  // Part 2 — narrative prompts (every starred prompt is required)
  if (!f.innovationCompanyOverview?.trim())  errors.push("2.1.1 Company overview is required");
  if (!f.innovationProblemAndImpact?.trim()) errors.push("2.1.2 Problem / impact is required");
  if (!f.innovationIpDescription?.trim())    errors.push("2.1.3 IP description is required");
  if (!f.marketOverview?.trim())             errors.push("2.2.1 Target market is required");
  if (!f.marketCompetitive?.trim())          errors.push("2.2.2 Competitive landscape is required");
  if (!f.marketAdvancement?.trim())          errors.push("2.2.3 Advancement / Canadian alignment is required");
  if (!f.planActivities?.trim())             errors.push("2.3.1 Commercialization-enabling activities is required");
  if (!f.planRationale?.trim())              errors.push("2.3.3 Rationale is required");
  if (!f.commercializationMilestones?.trim()) errors.push("2.4.1 Commercialization milestones is required");
  if (!f.commercializationImpacts?.trim())   errors.push("2.4.2 Anticipated impacts is required");
  if (!f.commercializationEngagement?.trim()) errors.push("2.4.3 Customer engagement mechanisms is required");
  if (!f.impactNextSteps?.trim())            errors.push("2.5.1 Next steps is required");

  // Timeline must have at least one row with a deliverable
  if (!Array.isArray(f.planTimeline) || f.planTimeline.length === 0 || !f.planTimeline.some((r) => r.deliverables?.trim())) {
    errors.push("2.3.2 Add at least one timeline row with a deliverable");
  }

  // Part 3 — Budget
  const total = (f.budgetLines ?? []).reduce<number>((s, r) => s + (r.amount ?? 0), 0);
  if (total <= 0) errors.push("Budget: at least one line item with an amount is required");
  if (total > STREAM_BUDGETS.venture_lift) {
    errors.push(`Budget exceeds the $${STREAM_BUDGETS.venture_lift.toLocaleString()} CAD cap (currently $${total.toLocaleString()})`);
  }

  // Part 4 — Appendices.  CV + IP doc are required; support
  // letters are optional but capped at 3.
  const cvCount       = docs.filter((d) => d.kind === "cv").length;
  const ipDocCount    = docs.filter((d) => d.kind === "ip_doc").length;
  const letterCount   = docs.filter((d) => d.kind === "support_letter").length;
  if (cvCount === 0)     errors.push("Appendix 1: CVs are required (Applicant + PI in one PDF)");
  if (ipDocCount === 0)  errors.push("Appendix 3: IP supporting documents are required — this is the hard eligibility gate (at least a provisional patent must be filed)");
  if (letterCount > 3)   errors.push("Appendix 2: max 3 support letters allowed");

  // Part 5 — Three signatures
  if (!f.primarySignatureName?.trim())  errors.push("Signature: Primary Applicant print-name is required");
  if (!f.primarySignatureDate?.trim())  errors.push("Signature: Primary Applicant date is required");
  if (!f.piSignatureName?.trim())       errors.push("Signature: PI print-name is required");
  if (!f.piSignatureDate?.trim())       errors.push("Signature: PI date is required");
  if (f.acknowledged !== true)          errors.push("Signature: All signers must tick the acknowledgement");

  return errors;
}

/** Total computed amount from VL Stage 2 budget lines. Reused by
 *  the submit handler to set requestedAmount. */
function sumVlFullBudget(f: VentureLiftFullData): number {
  return (f.budgetLines ?? []).reduce<number>((s, r) => s + (r.amount ?? 0), 0);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const userId = (session?.user as { id?: string })?.id;
  if (!session || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: {
      id: true, userId: true, stream: true, status: true,
      applicationStage: true, formData: true, documents: true,
      applicantType: true, institution: true,
    },
  });
  if (!app || app.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status = app.status as EquipStatus;
  const stage  = app.applicationStage as ApplicationStage;

  // Submit is meaningful in two cases:
  //   1. status = "draft"                 → first-time submit (VC + VL Stage-1)
  //   2. status = "pre_screen_approved"   → VL applicant has filled
  //                                         Stage-2 and is submitting it
  //      OR  stage = "full_app" and status is back to "draft"
  //          (post-pre-screen-approval draft of the Stage-2 form)
  const isVlFullSubmit = app.stream === "venture_lift" && stage === "full_app";
  if (status !== "draft" && status !== "pre_screen_approved") {
    return NextResponse.json({ ok: true, alreadySubmitted: true });
  }

  if (!app.applicantType || !app.institution) {
    return NextResponse.json(
      { error: "Eligibility block incomplete — re-run the wizard" },
      { status: 400 },
    );
  }

  const formData = (app.formData ?? {}) as Record<string, unknown>;
  const docs = (app.documents as unknown as EquipDocument[]) ?? [];
  let errors: string[] = [];
  let total = 0;

  if (app.stream === "venture_connect") {
    errors = validateVentureConnect(formData as VentureConnectFormData);
    total = sumVcBudget(formData as VentureConnectFormData);
  } else if (app.stream === "venture_lift" && isVlFullSubmit) {
    // VL Stage 2 — full application validation.
    errors = validateVentureLiftFull(formData as VentureLiftFullData, docs);
    total = sumVlFullBudget(formData as VentureLiftFullData);
  } else if (app.stream === "venture_lift") {
    // VL Stage 1 — pre-screening validation.
    errors = validateVentureLift(formData as VentureLiftFormData);
    total = STREAM_BUDGETS.venture_lift;
  } else {
    return NextResponse.json({ error: "Unknown stream" }, { status: 400 });
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });
  }

  // Deadline gating. The /equip landing page already nudges
  // applicants about open / closed status; this is the server-
  // side safety net so a stale tab can't slip past a closed
  // window. We bypass the gate for admins + superadmins +
  // equip_review committee members — they manage the windows
  // and routinely test the platform end-to-end, so blocking
  // their own submits because they haven't scheduled a window
  // first is friction without benefit.
  const role = (session.user as { role?: string }).role ?? "";
  const isPlatformReviewer = role === "admin" || role === "superadmin";
  let bypassDeadlineGate = isPlatformReviewer;
  if (!bypassDeadlineGate) {
    // Cheap committee check — only runs when the user isn't
    // already admin/superadmin, so we don't pay the query on
    // the hot path for platform staff.
    const onEquipReview = await prisma.committeeMembership.count({
      where: { userId, committee: "equip_review", active: true },
    });
    bypassDeadlineGate = onEquipReview > 0;
  }
  if (!bypassDeadlineGate) {
    const upcoming = await nextOpenDeadline(app.stream as EquipStream);
    if (!upcoming) {
      return NextResponse.json(
        { error: "There's no open funding window for this stream right now. Watch /equip for the next deadline." },
        { status: 400 },
      );
    }
  }

  const cap = STREAM_BUDGETS[app.stream as EquipStream];
  const requestedAmount = Math.min(total, cap);

  // For VL Stage-2 submits, stamp fullAppSubmittedAt instead of
  // resetting submittedAt (which holds Stage-1's timestamp).
  const now = new Date();
  const data: Record<string, unknown> = {
    status: "submitted",
    requestedAmount,
  };
  if (isVlFullSubmit) {
    data.fullAppSubmittedAt = now;
  } else {
    data.submittedAt = now;
  }

  const updated = await prisma.equipApplication.update({
    where: { id },
    data,
    select: {
      id: true, status: true, submittedAt: true, fullAppSubmittedAt: true,
      requestedAmount: true,
    },
  });

  // Confirmation email to the applicant. Best-effort — never block submit.
  if (mailConfigured()) {
    const applicant = await prisma.user.findUnique({
      where: { id: app.userId },
      select: { name: true, email: true },
    });
    if (applicant?.email) {
      const email = await buildEquipSubmissionEmail({
        applicantName: applicant.name,
        stream: app.stream as EquipStream,
        stage: app.applicationStage as ApplicationStage,
        requestedAmount,
      });
      try {
        await sendMail({ to: applicant.email, subject: email.subject, text: email.text, html: email.html });
      } catch (err) {
        console.error("[equip] submission email failed", { id, err });
      }
    }
  }

  return NextResponse.json({ ok: true, application: updated });
}
