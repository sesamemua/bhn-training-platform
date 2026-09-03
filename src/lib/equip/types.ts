/**
 * Shared types for the Equip funding-application pipeline.
 *
 * Aligned to the actual BHN application forms published at
 *   https://biohubnet.ca/download/EQUIP_VentureConnect_AppForm_Mar2026.pdf
 *   https://biohubnet.ca/download/EQUIP_VentureLift_PreScreeningForm_v3.pdf
 *
 * The DB stores per-stream form data as JSON; the typed shapes
 * here describe what the client expects to read back / write so
 * the wizard, the form, the admin queue, and the demo seeder all
 * agree on field names without an enum migration.
 */

export type EquipStream = "venture_connect" | "venture_lift" | "innovation_fellowship";

/** Stage of the application:
 *   pre_screen — VL Stage-1 (the short pre-screening form). VC
 *                also starts here for schema consistency but
 *                its applicants never linger — submitting a VC
 *                app advances it to full_app automatically.
 *   full_app   — the long-form application. For VL this is
 *                Stage-2 unlocked by a pre_screen_approved
 *                decision; for VC it's the only form. */
export type ApplicationStage = "pre_screen" | "full_app";

export type EquipStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "pre_screen_approved"
  | "pre_screen_rejected"
  | "approved"
  | "rejected"
  | "funded";

/** Applicant role checkboxes from the PDF forms. VC distinguishes
 *  Master's vs. PhD; VL groups them as "Graduate Student". We
 *  store the finer-grained value so VC has the data it needs;
 *  the VL form just renders the two grad options together. */
export type ApplicantRole =
  | "master_student"
  | "phd_student"
  | "postdoc"
  | "research_associate";

export type CommercializationStage = "exploring" | "building" | "unsure";

/** Maximum funding envelope per stream — used to validate budgets
 *  client-side and clamp on submit server-side. Per the BHN PDFs:
 *  VentureConnect grants up to $5,000 CAD per application (and a
 *  company may submit up to 3 separate applications, max $5K each);
 *  VentureLift pre-screening references up to $25,000 CAD for the
 *  full application that follows a successful pre-screen. */
export const STREAM_BUDGETS: Record<EquipStream, number> = {
  venture_connect:       5_000,
  venture_lift:         25_000,
  innovation_fellowship: 30_000,
};

/** Stream metadata for picker copy + admin labels. */
export const STREAM_META: Record<EquipStream, {
  name: string;
  blurb: string;
  cadence: string;
  bestFor: string;
}> = {
  venture_connect: {
    name: "VentureConnect",
    blurb: "Up to $5,000 CAD per application for one conference, workshop, or pitch event. A company may submit up to three separate applications.",
    cadence: "Monthly funding cycle",
    bestFor: "Attending an industry conference, customer demo, or pitch competition.",
  },
  venture_lift: {
    name: "VentureLift",
    blurb: "Two-stage application for up to $25,000 CAD. Stage 1 is a short pre-screening form; passing it unlocks the full Stage-2 application (Innovation, Market Potential, Project Plan, Commercialization Potential and Impact).",
    cadence: "Quarterly funding cycle",
    bestFor: "Pre-seed / seed-stage company with a provisional patent, prototype, and a commercialization roadmap.",
  },
  innovation_fellowship: {
    name: "Innovation Fellowship",
    blurb: "Six-month trainee entrepreneur fellowships for master's, PhD, and postdoctoral founders, plus innovation internships with accelerators or innovation organizations.",
    cadence: "Application window",
    bestFor: "Trainees advancing a venture through a focused six-month fellowship or entrepreneurship internship.",
  },
};

/** Status display metadata — colour ramp + human label.
 *  Used by both the applicant tracker and the admin queue. */
export const STATUS_META: Record<EquipStatus, { label: string; tone: "neutral" | "brand" | "amber" | "emerald" | "rose" | "violet" }> = {
  draft:                { label: "Draft",                tone: "neutral" },
  submitted:            { label: "Submitted",            tone: "brand"   },
  under_review:         { label: "Under review",         tone: "amber"   },
  pre_screen_approved:  { label: "Pre-screen passed",    tone: "emerald" },
  pre_screen_rejected:  { label: "Pre-screen — not selected", tone: "rose" },
  approved:             { label: "Approved",             tone: "emerald" },
  rejected:             { label: "Not selected",         tone: "rose"    },
  funded:               { label: "Funded",               tone: "violet"  },
};

// ── IP status shared between both forms ────────────────────────

/** The four IP-milestone checkboxes that appear on BOTH PDFs.
 *  Each is a checkbox + date pair; the applicant ticks any that
 *  apply. */
export interface IpStatusBlock {
  inventionDisclosureChecked?: boolean;
  inventionDisclosureDate?: string;     // ISO yyyy-mm-dd
  provisionalPatentChecked?: boolean;
  provisionalPatentDate?: string;
  fullPatentChecked?: boolean;
  fullPatentDate?: string;
  licensedTechnologyChecked?: boolean;
  licensedTechnologyDate?: string;
}

// ── VentureConnect form body (Mar 2026 PDF) ────────────────────

/** Shape stored under EquipApplication.formData when
 *  stream = "venture_connect". Mirrors the EQUIP VentureConnect
 *  Grant Application Form PDF section-by-section. */
export interface VentureConnectFormData {
  // ── Applicant Information ────────────────────────────────
  fullName?: string;
  institutionAffiliation?: string;
  departmentProgram?: string;
  currentRole?: ApplicantRole;
  /** Expected or completed graduation date. */
  graduationDate?: string;              // ISO yyyy-mm-dd
  institutionEmail?: string;

  // ── Company Information ──────────────────────────────────
  companyName?: string;
  /** Their position AT the company — Founder, CEO, CTO, Co-founder. Not
   *  on the paper PDF; distinct from `currentRole` above, which is
   *  academic standing (PhD student, postdoc, …). Someone can be a PhD
   *  student and the company's CTO at the same time — this is the half
   *  of that the academic-role field cannot say. */
  companyRole?: string;
  companyWebsite?: string;
  hasBiomanufacturingOrHumanHealthApplication?: boolean;
  /** Briefly describe your venture or innovation — overview of
   *  technology / product / service and current development stage.
   *  Maximum 500 words. */
  ventureDescription?: string;

  // ── Intellectual Property (IP) Status ────────────────────
  ip?: IpStatusBlock;

  // ── Funding Request Justification ────────────────────────
  /** Single textarea covering: how attendance advances the
   *  business opportunity, specific examples (Meet with investor
   *  X from Y VC firm…), eligible activities, key outcomes. */
  fundingJustification?: string;

  // ── Event Information ────────────────────────────────────
  /**
   * "Please Submit One Event Only" — the August 2026 form's own
   * heading. One category, not several: an application funds one
   * event, and the cap is per company across three applications.
   */
  eventCategory?: EventCategory;
  eventName?: string;
  eventLocation?: string;
  /** Free text: the form prints a single "Dates" line, and a range
   *  written the way the event advertises it is more useful to a
   *  reviewer than two date pickers that disagree with the website. */
  eventDates?: string;

  // ── Budget & Supporting Documentation ────────────────────
  /** Which of the named attachments are enclosed. The form is a
   *  checklist on paper; keeping it one here means an applicant can
   *  see what is still missing rather than guessing from the tray. */
  supportingDocs?: SupportingDocKey[];
  /** Each line item from the PDF table. Values in CAD. */
  budgetAirfare?: number;
  budgetTrainFare?: number;
  budgetRideshareTaxi?: number;
  budgetAccommodation?: number;
  budgetRegistration?: number;

  // ── Signature ────────────────────────────────────────────
  /** "I acknowledge that the information provided in this
   *  application is accurate and that the requested funds will
   *  be used for the purposes outlined in this application." */
  acknowledged?: boolean;
  signaturePrintedName?: string;
  signatureDate?: string;             // ISO yyyy-mm-dd
}

/** The four boxes under "Category" on the August 2026 form. */
export const EVENT_CATEGORIES = [
  { id: "conference", label: "Industry / Investor Conference" },
  { id: "pitch", label: "Pitch Competition" },
  { id: "workshop", label: "Entrepreneurship Training / Workshop" },
  { id: "customer_demo", label: "Customer Demo" },
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number]["id"];

/** The checklist printed under "Supporting Documentation". */
export const SUPPORTING_DOCS = [
  { id: "pitch_deck", label: "Business pitch deck" },
  { id: "registration", label: "Event registration information" },
  { id: "cost_estimates", label: "Travel & accommodation cost estimates" },
  { id: "investor_invites", label: "Investor meeting invitations or confirmations" },
  { id: "customer_confirmations", label: "Customer meeting confirmations" },
  { id: "pitch_acceptance", label: "Pitch competition acceptance" },
  { id: "workshop_agenda", label: "Training / workshop agenda" },
  { id: "other", label: "Other supporting documentation" },
] as const;
export type SupportingDocKey = (typeof SUPPORTING_DOCS)[number]["id"];

// ── Innovation Fellowship application (Aug 2026 PDF) ──────────

export const INNOVATION_FELLOWSHIP_OPPORTUNITIES = [
  {
    id: "trainee_fellowship_grad",
    label: "Trainee Entrepreneur Fellowship - Master's / PhD",
    shortLabel: "Master's / PhD Fellowship",
    amount: 20_333,
    description: "$20,333 CAD for six months",
  },
  {
    id: "trainee_fellowship_postdoc",
    label: "Trainee Entrepreneur Fellowship - Postdoctoral Fellow",
    shortLabel: "Postdoctoral Fellowship",
    amount: 30_000,
    description: "$30,000 CAD for six months",
  },
  {
    id: "innovation_internship",
    label: "Innovation Internship",
    shortLabel: "Innovation Internship",
    amount: null,
    description: "Stipend support for an entrepreneurship-focused internship with an accelerator or innovation organization",
  },
] as const;

export type InnovationFellowshipOpportunity =
  (typeof INNOVATION_FELLOWSHIP_OPPORTUNITIES)[number]["id"];

export function innovationFellowshipRoleMatchesOpportunity(
  opportunity: InnovationFellowshipOpportunity | undefined,
  role: ApplicantRole | undefined,
): boolean {
  if (!opportunity || !role || opportunity === "innovation_internship") return true;
  if (opportunity === "trainee_fellowship_postdoc") return role === "postdoc";
  return role === "master_student" || role === "phd_student";
}

export const INNOVATION_FELLOWSHIP_IP_STATUSES = [
  { id: "no_ip", label: "No IP" },
  { id: "under_development", label: "IP under development" },
  { id: "provisional_filed", label: "Provisional patent filed" },
  { id: "patent_application_filed", label: "Patent application filed" },
  { id: "issued_patent", label: "Issued patent" },
  { id: "other", label: "Other" },
] as const;

export type InnovationFellowshipIpStatus =
  (typeof INNOVATION_FELLOWSHIP_IP_STATUSES)[number]["id"];

export interface InnovationFellowshipFundingRow {
  id: string;
  source?: string;
  amount?: number;
  date?: string;
  purpose?: string;
}

export interface InnovationFellowshipMilestone {
  id: string;
  expectedOutcome?: string;
  targetDate?: string;
}

/** Shape stored under EquipApplication.formData when
 *  stream = "innovation_fellowship". It follows the August 2026
 *  Innovation Fellowship PDF and keeps fellowship-only and
 *  internship-only answers in separate conditional sections. */
export interface InnovationFellowshipFormData {
  // Opportunity
  opportunity?: InnovationFellowshipOpportunity;

  // 1. Applicant Information
  fullName?: string;
  institutionEmail?: string;
  institutionAffiliation?: string;
  departmentProgram?: string;
  supervisorName?: string;
  supervisorEmail?: string;
  currentRole?: ApplicantRole;
  graduationDate?: string;
  ventureRole?: string;
  ventureTimeCommitment?: string;
  receivesOtherSupport?: boolean;
  otherSupportDetails?: string;

  // 2. Venture / Innovation Information
  ventureName?: string;
  companyWebsite?: string;
  ipStatuses?: InnovationFellowshipIpStatus[];
  ipOther?: string;
  innovationDescription?: string;
  ventureStage?: string;
  commercializationRoadmap?: string;
  marketOpportunity?: string;
  receivedPreviousFunding?: boolean;
  previousFunding?: InnovationFellowshipFundingRow[];

  // 3A. Trainee Entrepreneur Fellowship
  fellowshipPlan?: string;
  fellowshipMilestones?: InnovationFellowshipMilestone[];
  fellowshipCommercialization?: string;

  // 3B. Innovation Internship
  internshipHostOrganization?: string;
  internshipStartDate?: string;
  internshipEndDate?: string;
  internshipProgramName?: string;
  internshipImportance?: string;
  internshipApplication?: string;

  // 4. Applicant and supervisor attestations. The program-manager
  // signature remains an internal BioHubNet review step.
  acknowledged?: boolean;
  applicantSignatureName?: string;
  applicantSignatureDate?: string;
  supervisorSignatureName?: string;
  supervisorSignatureDate?: string;
}

export function innovationFellowshipRequestedAmount(
  opportunity: InnovationFellowshipOpportunity | undefined,
): number | null {
  return INNOVATION_FELLOWSHIP_OPPORTUNITIES.find((item) => item.id === opportunity)?.amount ?? null;
}

// ── VentureLift pre-screening form (v3 PDF) ────────────────────

/** Shape stored under EquipApplication.formData when
 *  stream = "venture_lift". This mirrors the VentureLift
 *  Pre-Screening Form — NOT the full application, which BHN
 *  invites separately. */
export interface VentureLiftFormData {
  // ── Company Information ──────────────────────────────────
  companyName?: string;
  companyWebsite?: string;

  // ── Applicant Information ────────────────────────────────
  fullName?: string;
  institutionAffiliation?: string;
  departmentProgram?: string;
  currentRole?: "grad_student" | "postdoc" | "research_associate";
  institutionalEmail?: string;
  /** Title / position the applicant holds in the company. */
  applicantTitleInCompany?: string;
  /** Estimated time commitment to the company — accepts % or
   *  FTE string ("20%", "0.4 FTE", etc.). */
  applicantTimeCommitment?: string;

  // ── Principal Investigator (PI) Information ─────────────
  piFullName?: string;
  piInstitutionAffiliation?: string;
  piDepartmentProgram?: string;
  piInstitutionalEmail?: string;
  piTitleInCompany?: string;

  // ── IP Status ────────────────────────────────────────────
  ip?: IpStatusBlock;

  // ── Company Overview (max 100 words) ────────────────────
  /** Concise summary of the company — core mission, key
   *  products / technologies, target market, competitive
   *  advantage, biomanufacturing-sector contribution,
   *  commercialization potential. */
  companyOverview?: string;

  // ── Project Summary (max 100 words) ─────────────────────
  /** Funding-request summary — commercialization-enabling
   *  activities, expected outcomes and impact, $25K allocation,
   *  CRO / consultant / external partner identification. */
  projectSummary?: string;

  // ── Eligibility Checklist (seven self-attestations) ─────
  eligibilityStemProfessional?: boolean;
  eligibilityCanadianIp?: boolean;
  eligibilityHealthOutcomesBiomanufacturing?: boolean;
  eligibilityAcceleratorParticipated?: boolean;
  /** Free-text list of accelerator / incubator program names. */
  acceleratorPrograms?: string;
  eligibilityPreseedStageReady?: boolean;
  eligibilityNoDuplicateFunding?: boolean;
  eligibilityPiHoldsFunds?: boolean;

  // ── Signature ────────────────────────────────────────────
  signaturePrintedName?: string;
  signatureDate?: string;
}

// ── VentureLift FULL application (Stage 2 — Oct 2025 PDF) ──────

/** Single line item in the Stage-2 budget table. Mirrors the
 *  columns in the VentureLift Budget Template xlsx so the form
 *  produces a structured equivalent of the spreadsheet. */
export interface VentureLiftBudgetLine {
  id: string;
  /** Maps to the four categories on the spreadsheet:
   *   services | consulting | materials_supplies | other */
  category: "services" | "consulting" | "materials_supplies" | "other";
  /** References Activity # in Part 2.3.2's timeline table. */
  activityNumber?: string;
  itemDescription?: string;
  justification?: string;
  unitCount?: number;
  unitRate?: number;
  /** Computed client-side as unitCount × unitRate but stored
   *  too so saved drafts don't drift if the schema evolves. */
  amount?: number;
  serviceProviderName?: string;
}

/** Partner / external contribution to the project. Used to show
 *  matched funding or in-kind support alongside the BHN ask. */
export interface VentureLiftPartnerContribution {
  id: string;
  partnerName?: string;
  kind?: "cash" | "in_kind";
  description?: string;
  amountOrUnitCount?: string;
}

/** Row in Part 2.3.2 — Expected Timeline and Deliverables.
 *  PDF caps the project at 6 months. */
export interface VentureLiftTimelineRow {
  id: string;
  activityNumber?: string;
  deliverables?: string;
  primaryPlaceOfWork?: string;
  completionDate?: string; // ISO yyyy-mm-dd
}

/** Team-member row from Part 1.4. */
export interface VentureLiftTeamMember {
  id: string;
  name?: string;
  role?: string;
  areaOfExpertise?: string;
  institution?: string;
}

/** Shape stored under EquipApplication.formData when
 *  stream = "venture_lift" AND applicationStage = "full_app".
 *  Mirrors the EQUIP VentureLift Grant Application Form
 *  (Oct 2025 PDF) section-by-section. */
export interface VentureLiftFullData {
  // ── Project title ────────────────────────────────────────
  projectTitle?: string;

  // ── Part 1.1 Primary Applicant ───────────────────────────
  applicantFullName?: string;
  applicantRole?: ApplicantRole;
  applicantInstitution?: string;
  applicantDepartment?: string;
  applicantTitleInCompany?: string;
  applicantTimeCommitment?: string;

  // ── Part 1.2 Principal Investigator ─────────────────────
  piFullName?: string;
  piInstitution?: string;
  piDepartment?: string;
  piTitleInCompany?: string;
  /** Bulleted role description — three lines on the PDF; we
   *  store one string and let the renderer split on newlines. */
  piRoleDescription?: string;

  // ── Part 1.3 Company Information ────────────────────────
  companyName?: string;
  companyAddress?: string;
  companyWebsite?: string;
  companyIncorporationDate?: string; // ISO yyyy-mm-dd
  /** Nature of the IP / startup. Multi-check per the PDF. */
  natureProduct?: boolean;
  natureService?: boolean;
  natureTechnologyPlatform?: boolean;

  // ── Part 1.4 Other Team Members ─────────────────────────
  teamMembers?: VentureLiftTeamMember[];

  // ── Part 2.1 Innovation & Technical Merit ───────────────
  innovationCompanyOverview?: string;        // 2.1.1
  innovationProblemAndImpact?: string;       // 2.1.2
  innovationIpDescription?: string;          // 2.1.3 (free-form)

  // ── Part 2.2 Market Potential ───────────────────────────
  marketOverview?: string;          // 2.2.1
  marketCompetitive?: string;       // 2.2.2
  marketAdvancement?: string;       // 2.2.3

  // ── Part 2.3 Project Plan ───────────────────────────────
  planActivities?: string;                  // 2.3.1
  planTimeline?: VentureLiftTimelineRow[];  // 2.3.2
  planRationale?: string;                   // 2.3.3

  // ── Part 2.4 Commercialization Potential ────────────────
  commercializationMilestones?: string;       // 2.4.1
  commercializationImpacts?: string;          // 2.4.2
  commercializationEngagement?: string;       // 2.4.3

  // ── Part 2.5 Impact & Follow-on Potential ──────────────
  impactNextSteps?: string;                 // 2.5.1
  impactIncubatorParticipation?: string;    // 2.5.2

  // ── Part 3 Budget ───────────────────────────────────────
  budgetLines?: VentureLiftBudgetLine[];
  partnerContributions?: VentureLiftPartnerContribution[];
  budgetNotes?: string;

  // ── Part 5 Signatures (three signers) ───────────────────
  primarySignatureName?: string;
  primarySignatureDate?: string;     // ISO yyyy-mm-dd
  founderSignatureName?: string;
  founderSignatureDate?: string;
  piSignatureName?: string;
  piSignatureDate?: string;
  /** Master "I acknowledge" block — all three signers tick it. */
  acknowledged?: boolean;
}

/** Reviewer scoring rubric for VL Stage 2 (Reviewer Guide).
 *  Six 1–5 scores + an overall comment. We don't store a total
 *  — the reviewer surface computes it client-side from the
 *  individual scores so changing the weighting doesn't require
 *  a backfill. */
export interface VentureLiftReviewerScores {
  innovation?: number;          // 1.  Innovation and Technical Merit
  market?: number;              // 2.  Market Potential and Industry Relevance
  plan?: number;                // 3.  Project Plan and Deliverables
  commercialization?: number;   // 4.  Commercialization Potential
  impact?: number;              // 5.  Impact and Follow-on Potential
  budget?: number;              // 6.  Budget and Use of Funds
  comment?: string;
}

/** Document attachment record stored inside
 *  EquipApplication.documents. Pitch decks are explicitly
 *  encouraged by both PDFs ("attach a business pitch deck to
 *  support your application"). */
export interface EquipDocument {
  key: string;
  name: string;
  size: number;
  contentType: string;
  /** What this attachment represents in the application. The
   *  cv / support_letter / ip_doc kinds are VL Stage-2 appendix
   *  categories from the application PDF. */
  kind:
    | "pitch_deck"
    | "prototype_photo"
    | "letter"
    | "video_pitch"
    | "cv"
    | "support_letter"
    | "ip_doc"
    | "other";
  uploadedAt: string;
}

/** Milestone record stored inside EquipApplication.milestones.
 *  Templated when an application transitions to "funded". */
export interface EquipMilestone {
  id: string;
  title: string;
  /** ISO date — when this check-in is expected. */
  dueOn: string;
  status: "pending" | "in_progress" | "complete" | "blocked";
  note?: string;
  updatedAt: string;
}

// ── State-machine guards ───────────────────────────────────────

/** Statuses where the applicant can still edit. The applicant
 *  can also edit when their pre-screening was approved — they
 *  need to fill in Stage 2. */
export function isEditable(status: EquipStatus): boolean {
  return status === "draft" || status === "pre_screen_approved";
}

/** Statuses considered "open" — counted in the admin queue. */
export function isOpenForReview(status: EquipStatus): boolean {
  return status === "submitted" || status === "under_review";
}

/** Statuses that lock the application. Pre-screen rejection is
 *  terminal; pre-screen approval is NOT (the applicant still
 *  needs to fill in Stage 2). */
export function isTerminal(status: EquipStatus): boolean {
  return status === "approved" || status === "rejected" || status === "funded" || status === "pre_screen_rejected";
}

/** True when the application is VL and is currently in Stage 2
 *  (the full-application form is unlocked). Helps the applicant
 *  page pick which form component to render. */
export function isInFullAppStage(
  stream: EquipStream,
  stage: ApplicationStage,
  status: EquipStatus,
): boolean {
  // VC has no pre-screening — every VC app is full_app once
  // saved. VL has to reach pre_screen_approved first.
  if (stream === "venture_connect") return true;
  return stage === "full_app" || status === "pre_screen_approved";
}

/** Recommended stream for a given commercialization stage.
 *  Used by the eligibility wizard. */
export function recommendStream(stage: CommercializationStage): EquipStream | null {
  if (stage === "exploring") return "venture_connect";
  if (stage === "building")  return "venture_lift";
  return null;
}

/** Word counter used to enforce the PDF's 100-word limits on the
 *  VentureLift Company Overview + Project Summary fields. */
export function wordCount(text: string | undefined | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Hard prohibition the BHN PDFs spell out: "Applicants are
 *  strongly advised against using AI writing tools to complete the
 *  application sections. Applications found to contain
 *  AI-generated content will be disqualified." Surface this
 *  prominently on every form. */
export const NO_AI_DISCLAIMER =
  "Applicants are strongly advised against using AI writing tools to complete the application sections. Applications found to contain AI-generated content will be disqualified.";
