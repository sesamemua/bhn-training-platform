/**
 * Admin-only seed/clear pair for /admin/equip.
 *
 *   POST   /api/admin/equip/demo/seed   → create six throwaway
 *                                          applicants + a mix of
 *                                          draft / submitted /
 *                                          under_review / approved /
 *                                          rejected / funded apps
 *   DELETE /api/admin/equip/demo/seed   → wipe the same users
 *                                          (cascading FKs sweep
 *                                           every EquipApplication
 *                                           and Message they own)
 *
 * Mirrors the AutoPipette demo seeder: predictable email pattern
 * (`equip-demo-{slug}@bhn.test`), `accountKind = "demo"`, snapshot
 * data hand-tuned so each section of /admin/equip renders
 * meaningfully even on a fresh deploy.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { templateMilestones } from "@/lib/equip/milestones";
import type {
  VentureConnectFormData,
  VentureLiftFormData,
  EquipStatus,
  EquipStream,
} from "@/lib/equip/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEMO_EMAIL_PREFIX = "equip-demo-";
const DEMO_EMAIL_SUFFIX = "@bhn.test";

interface DemoUser {
  slug: string;
  name: string;
  organization: string;
  institution: string;
}

const DEMO_USERS: DemoUser[] = [
  { slug: "ayaan",   name: "Ayaan Khan (demo)",   organization: "U of T — Donnelly Centre", institution: "u-of-t" },
  { slug: "lin",     name: "Lin Wei (demo)",      organization: "Queen's — Biochem",        institution: "queens" },
  { slug: "rosa",    name: "Rosa Albright (demo)",organization: "Sunnybrook Research Institute",          institution: "sunnybrook" },
  { slug: "dev",     name: "Dev Singh (demo)",    organization: "Waterloo — School of Pharm",institution: "waterloo" },
  { slug: "noor",    name: "Noor Hassan (demo)",  organization: "Western — Schulich",       institution: "western" },
  { slug: "joelle",  name: "Joëlle Tremblay (demo)", organization: "University Health Network",institution: "uhn" },
];

function emailFor(slug: string): string {
  return `${DEMO_EMAIL_PREFIX}${slug}${DEMO_EMAIL_SUFFIX}`;
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build a realistic VentureConnect form body that matches the
 *  EQUIP VentureConnect Grant Application Form PDF (Mar 2026). */
function vcForm(applicantName: string, companyName: string, budget: number): VentureConnectFormData {
  return {
    // Applicant Information
    fullName: applicantName,
    institutionAffiliation: "University of Toronto",
    departmentProgram: "Donnelly Centre for Cellular and Biomolecular Research",
    currentRole: "phd_student",
    institutionEmail: `${applicantName.split(" ")[0].toLowerCase()}@biohubnet.test`,

    // Company Information
    companyName,
    companyRole: "Co-founder & CTO",
    companyWebsite: "https://example-bio.test",
    ventureDescription:
      "We're developing a cell-free protein purification platform that drops downstream processing time by ~40%. Current development stage: working prototype validated on three model proteins; planning a paid pilot with one biotech partner next quarter.",

    // IP Status
    ip: {
      provisionalPatentChecked: true,
      provisionalPatentDate: isoDate(daysAgo(120)),
    },

    // Funding Request Justification
    fundingJustification:
      "Attendance at this event lets us run two pre-scheduled investor meetings (one with a seed-stage VC who explicitly invited us after our last poster session) plus a paid-pilot conversation with a manufacturing partner. We expect at least one qualified term-sheet conversation and one warm intro to a CDMO out of this trip — both materially advance our seed round and our first paid pilot in parallel.",

    // Budget — five line items per the PDF table
    budgetAirfare:        Math.round(budget * 0.30),
    budgetTrainFare:      0,
    budgetRideshareTaxi:  Math.round(budget * 0.05),
    budgetAccommodation:  Math.round(budget * 0.35),
    budgetRegistration:   Math.round(budget * 0.30),

    // Signature
    acknowledged: true,
    signaturePrintedName: applicantName,
    signatureDate: isoDate(new Date()),
  };
}

/** Build a realistic VentureLift PRE-SCREENING form body that
 *  matches the EQUIP VentureLift Grant Pre-Screening Form (v3)
 *  PDF — NOT the full $25K application that follows. */
function vlForm(applicantName: string, companyName: string): VentureLiftFormData {
  const firstName = applicantName.split(" ")[0].toLowerCase();
  return {
    // Company Information
    companyName,
    companyWebsite: "https://example-bio.test",

    // Applicant Information
    fullName: applicantName,
    institutionAffiliation: "University of Toronto",
    departmentProgram: "Donnelly Centre for Cellular and Biomolecular Research",
    currentRole: "grad_student",
    institutionalEmail: `${firstName}@biohubnet.test`,
    applicantTitleInCompany: "Co-founder + CTO",
    applicantTimeCommitment: "30% (research) + 70% (company)",

    // PI Information
    piFullName: "Dr. Avery Park",
    piInstitutionAffiliation: "University of Toronto",
    piDepartmentProgram: "Donnelly Centre",
    piInstitutionalEmail: "a.park@biohubnet.test",
    piTitleInCompany: "Scientific Co-founder",

    // IP Status
    ip: {
      provisionalPatentChecked: true,
      provisionalPatentDate: isoDate(daysAgo(120)),
    },

    // Company Overview (max 100 words)
    companyOverview:
      "We're a Toronto-based pre-seed biotech building a cell-free protein purification platform that cuts downstream processing time roughly 40%. The target market is small-batch biologics — early-stage CDMOs and academic spinouts who lack the volume to justify traditional chromatography skids. Our competitive advantage is the proprietary affinity tag chemistry (provisional patent filed) and a single-use cartridge design that lowers cost-per-gram below incumbent column-based workflows. We contribute to Canadian biomanufacturing capacity by enabling faster scale-up for early-stage therapeutic and diagnostic candidates, with a clear commercialization path through paid pilots and IP licensing into 2027.",

    // Project Summary (max 100 words)
    projectSummary:
      "Requested funds will support three commercialization-enabling activities over six months: (1) a paid validation pilot at one external CDMO partner (~$10K materials + access), (2) regulatory CMC consulting with an external biomanufacturing-quality advisor (~$8K), and (3) a market-validation sprint targeting five potential commercial customers (~$7K travel + materials). The applicant trainee leads pilot execution and customer-discovery interviews directly; the consultant supports the regulatory deliverables only. No duplicate funding sources for these activities.",

    // Eligibility Checklist
    eligibilityStemProfessional: true,
    eligibilityCanadianIp: true,
    eligibilityHealthOutcomesBiomanufacturing: true,
    eligibilityAcceleratorParticipated: true,
    acceleratorPrograms: "Creative Destruction Lab — Bio Stream (2025-2026 cohort), JLABS @ Toronto",
    eligibilityPreseedStageReady: true,
    eligibilityNoDuplicateFunding: true,
    eligibilityPiHoldsFunds: true,

    // Signature
    signaturePrintedName: applicantName,
    signatureDate: isoDate(new Date()),
  };
}

interface DemoAppSpec {
  stream: EquipStream;
  status: EquipStatus;
  formData: VentureConnectFormData | VentureLiftFormData;
  requestedAmount: number;
  approvedAmount?: number;
  submittedDaysAgo?: number;
  decidedDaysAgo?: number;
  fundedDaysAgo?: number;
  reviewerNote?: string;
  disbursementNote?: string;
  aiAssisted?: boolean;
}

/** Status-per-user matrix so every column on /admin/equip lights up. */
const DEMO_APPS: Record<string, DemoAppSpec> = {
  ayaan:  {
    stream: "venture_connect", status: "submitted",
    formData: vcForm("Ayaan Khan (demo)", "PuriBio Inc.", 4900),
    requestedAmount: 4900, submittedDaysAgo: 2,
  },
  lin:    {
    stream: "venture_lift", status: "under_review",
    formData: vlForm("Lin Wei (demo)", "CellFreeBio Inc."),
    requestedAmount: 25000, submittedDaysAgo: 5,
  },
  rosa:   {
    stream: "venture_connect", status: "approved",
    formData: vcForm("Rosa Albright (demo)", "SynBio North Inc.", 4500),
    requestedAmount: 4500, approvedAmount: 4500,
    submittedDaysAgo: 14, decidedDaysAgo: 10,
    reviewerNote: "Strong fit. Approved at full requested amount.",
  },
  dev:    {
    stream: "venture_lift", status: "funded",
    formData: vlForm("Dev Singh (demo)", "Continuous Flow Bio Inc."),
    requestedAmount: 25000, approvedAmount: 22000,
    submittedDaysAgo: 45, decidedDaysAgo: 30, fundedDaysAgo: 21,
    reviewerNote: "Approved at $22K. Strong commercialization roadmap.",
    disbursementNote: "EFT-2026-0421 · disbursed 21 days ago",
  },
  noor:   {
    stream: "venture_lift", status: "rejected",
    formData: vlForm("Noor Hassan (demo)", "AssayLab Inc."),
    requestedAmount: 25000,
    submittedDaysAgo: 25, decidedDaysAgo: 18,
    reviewerNote: "Encourage to re-apply once IP filing is in progress.",
  },
  joelle: {
    stream: "venture_connect", status: "draft",
    formData: vcForm("Joëlle Tremblay (demo)", "CardioBio Inc.", 0),
    requestedAmount: 0,
  },
};

export async function POST() {
  await requireRole("admin");

  let usersCreated = 0;
  let appsCreated = 0;
  const now = new Date();

  for (const demo of DEMO_USERS) {
    const email = emailFor(demo.slug);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: demo.name,
        role: "trainee",
        accountKind: "demo",
        organization: demo.organization,
        jobTitle: "Graduate researcher (demo)",
        country: "Canada",
      },
      update: { organization: demo.organization },
      select: { id: true },
    });
    usersCreated++;

    // Wipe existing apps + their messages for this demo user so
    // re-seeding stays clean.
    await prisma.equipApplication.deleteMany({ where: { userId: user.id } });

    const spec = DEMO_APPS[demo.slug];
    if (!spec) continue;

    // Funded demo gets a templated set of milestones, with a couple
    // already nudged forward so the tracker shows progress, not a
    // blank slate.
    const milestones = spec.status === "funded" && spec.fundedDaysAgo !== undefined
      ? (() => {
          const fundedOn = daysAgo(spec.fundedDaysAgo!);
          const stamped = templateMilestones(spec.stream, fundedOn);
          if (stamped[0]) {
            stamped[0] = { ...stamped[0], status: "complete", note: "Confirmed registration last week." };
          }
          if (stamped[1]) {
            stamped[1] = { ...stamped[1], status: "in_progress", note: "Mid-project review scheduled for next Friday." };
          }
          return stamped;
        })()
      : [];

    const data: Prisma.EquipApplicationCreateInput = {
      user: { connect: { id: user.id } },
      stream: spec.stream,
      status: spec.status,
      applicantType: "grad",
      institution: demo.institution,
      institutionOther: null,
      commercializationStage: spec.stream === "venture_lift" ? "building" : "exploring",
      formData: spec.formData as unknown as Prisma.InputJsonValue,
      requestedAmount: spec.requestedAmount,
      approvedAmount: spec.approvedAmount ?? null,
      reviewerNote: spec.reviewerNote ?? null,
      disbursementNote: spec.disbursementNote ?? null,
      aiAssisted: spec.aiAssisted ?? false,
      milestones: milestones as unknown as Prisma.InputJsonValue,
      submittedAt: spec.submittedDaysAgo !== undefined ? daysAgo(spec.submittedDaysAgo) : null,
      reviewedAt: spec.decidedDaysAgo !== undefined ? daysAgo(spec.decidedDaysAgo) : null,
      decidedAt: spec.decidedDaysAgo !== undefined ? daysAgo(spec.decidedDaysAgo) : null,
      fundedAt: spec.fundedDaysAgo !== undefined ? daysAgo(spec.fundedDaysAgo) : null,
      createdAt: spec.submittedDaysAgo !== undefined ? daysAgo(spec.submittedDaysAgo + 1) : now,
      updatedAt: spec.fundedDaysAgo !== undefined
        ? daysAgo(spec.fundedDaysAgo)
        : spec.decidedDaysAgo !== undefined
          ? daysAgo(spec.decidedDaysAgo)
          : spec.submittedDaysAgo !== undefined
            ? daysAgo(spec.submittedDaysAgo)
            : now,
    };

    const app = await prisma.equipApplication.create({ data, select: { id: true } });
    appsCreated++;

    // Seed a couple of messages on the under_review + approved apps
    // so the thread UI has something to render on first visit.
    if (spec.status === "under_review") {
      await prisma.equipApplicationMessage.create({
        data: {
          applicationId: app.id,
          userId: user.id,
          body: "Happy to clarify any part of the roadmap or budget — let me know what's most useful for your call.",
        },
      });
    }
    if (spec.status === "approved") {
      await prisma.equipApplicationMessage.create({
        data: {
          applicationId: app.id,
          userId: user.id,
          body: "Thank you! Should I confirm the conference registration before disbursement clears?",
        },
      });
    }
  }

  return NextResponse.json({ ok: true, usersCreated, appsCreated });
}

export async function DELETE() {
  await requireRole("admin");

  const users = await prisma.user.findMany({
    where: {
      email: {
        startsWith: DEMO_EMAIL_PREFIX,
        endsWith: DEMO_EMAIL_SUFFIX,
      },
    },
    select: { id: true },
  });
  if (users.length === 0) {
    return NextResponse.json({ ok: true, deletedUsers: 0 });
  }
  const result = await prisma.user.deleteMany({
    where: { id: { in: users.map((u) => u.id) } },
  });
  return NextResponse.json({ ok: true, deletedUsers: result.count });
}
