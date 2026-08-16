/**
 * Employer demo-world seeder — the engine behind both:
 *   • POST/DELETE /api/employer/demo/seed (self-service, session-gated)
 *   • /api/demo/reset (demo deployment's nightly reset, no session)
 *
 * See the route file for the full design rationale (funnel shapes,
 * applicant pool, batching strategy).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCompanyId } from "@/lib/employer/admin-preview";

// ── Funnel shape ──────────────────────────────────────────────────
// Currently-in-stage counts (a snapshot). `rejected` accumulates
// across the cycle and inflates total applicants without showing as a
// pipeline column. `onsite` feeds velocity + total but (like rejected)
// isn't a column in the per-posting table — both are intentional.

interface FunnelShape {
  new:          number;
  reviewing:    number;
  shortlisted:  number;
  phone_screen: number;
  onsite:       number;
  offer:        number;
  hired:        number;
  rejected:     number;
}

const POSTING_TEMPLATES: Array<{
  title:           string;
  duration:        string;
  hours:           string;
  location:        string;
  type:            string;
  compensation:    string;
  keySkills:       string[];
  positionDetails: string;
  funnel:          FunnelShape;
}> = [
  {
    title: "Research Associate Intern",
    duration: "4 months",
    hours: "Full-time",
    location: "Toronto, ON",
    type: "Internship",
    compensation: "$22/hr",
    keySkills: ["Cell culture", "PCR", "Western blot", "Documentation"],
    positionDetails:
      "Hands-on wet-lab support across cell-line maintenance, sample prep, and assay readouts. Reports to a senior scientist; you'll join a small team focused on early-stage discovery.",
    // Hot role — high volume, healthy pyramid.
    funnel: { new: 16, reviewing: 8, shortlisted: 5, phone_screen: 3, onsite: 2, offer: 1, hired: 1, rejected: 11 },
  },
  {
    title: "Regulatory Affairs Coordinator",
    duration: "6 months",
    hours: "Full-time",
    location: "Hybrid · Toronto",
    type: "Internship",
    compensation: "$24/hr",
    keySkills: ["Health Canada filings", "Document control", "Excel", "Quality systems"],
    positionDetails:
      "Support our regulatory team through document prep, submission tracking, and GxP-aligned record-keeping. Good fit for someone who likes neat systems and is patient with detail.",
    // Standard role — moderate volume.
    funnel: { new: 8, reviewing: 5, shortlisted: 3, phone_screen: 2, onsite: 1, offer: 1, hired: 1, rejected: 6 },
  },
  {
    title: "Business Development Analyst",
    duration: "1 month",
    hours: "Part-time",
    location: "Remote · Canada",
    type: "Co-op",
    compensation: "$26/hr",
    keySkills: ["Market research", "Competitive analysis", "Excel modelling", "Deck design"],
    positionDetails:
      "Market-sizing sprints + competitive landscapes for two new product lines. Heavy on synthesis; light on bureaucracy. Mentored by the BD lead with weekly review of your decks.",
    // Niche / part-time role — low volume, already filled (a hire, no open offer).
    funnel: { new: 4, reviewing: 2, shortlisted: 2, phone_screen: 1, onsite: 1, offer: 0, hired: 1, rejected: 3 },
  },
];

// ── Applicant pool ────────────────────────────────────────────────
// 8 × 7 = 56 distinct full names (guaranteed unique by cartesian
// product). The largest single-posting funnel is 47 ≤ 56, so every
// posting can draw a distinct applicant per slot.

const FIRST_NAMES = ["Alex", "Priya", "Marcus", "Sara", "Jordan", "Olivia", "David", "Maya"];
const LAST_NAMES  = ["Chen", "Patel", "Williams", "Mendez", "Kim", "Brown", "Lee"];

const APPLICANT_POOL: string[] = [];
for (const f of FIRST_NAMES) for (const l of LAST_NAMES) APPLICANT_POOL.push(`${f} ${l}`);

const applicantEmail = (i: number) => `demo.seed.applicant.${i}@bhn.test`;

// ── Stage timing ──────────────────────────────────────────────────
// [minDaysAgo, maxDaysAgo] for stageEnteredAt. Later stages skew
// further into the past so "avg days in stage" rises down the funnel
// (a realistic ascending velocity curve) and the dashboard's "stale ≥
// 7d" filter has rows on both sides. Order matches STAGE_ORDER on the
// analytics page.

const STAGE_DAY_RANGE: Record<string, [number, number]> = {
  new:          [0, 4],
  reviewing:    [3, 8],
  shortlisted:  [6, 13],
  phone_screen: [9, 17],
  onsite:       [13, 22],
  offer:        [16, 26],
  hired:        [22, 34],
  rejected:     [5, 28], // wide; excluded from velocity (not in STAGE_ORDER)
};

// Order we walk the funnel in. The per-posting applicant cursor
// advances through this list, so every slot gets a distinct applicant.
const FUNNEL_ORDER: (keyof FunnelShape)[] = [
  "new", "reviewing", "shortlisted", "phone_screen", "onsite", "offer", "hired", "rejected",
];

const COVER_LETTER_VARIANTS = [
  (skill: string) =>
    `Hi, thanks for considering me. I've been studying ${skill.toLowerCase()} for the last two semesters and would love to bring that into your team.`,
  (skill: string) =>
    `I'm drawn to this role because it leans on ${skill.toLowerCase()} — something I've spent a co-op term and a capstone project getting hands-on with.`,
  (skill: string) =>
    `My coursework and lab time have centred on ${skill.toLowerCase()}, and I'm keen to apply it somewhere the work actually ships.`,
];

const REJECTION_REASONS = [
  "Strong on paper, but we moved forward with candidates who had more direct bench time.",
  "Filled this seat from another shortlist. Encouraged to reapply for future openings.",
  "Good conversation — timing and start-date constraints didn't line up on our side.",
  "Close call; the panel leaned toward a candidate with adjacent regulatory experience.",
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** A random Date within a stage's [min,max] days-ago window. */
function randDaysAgo(stage: keyof FunnelShape): Date {
  const [lo, hi] = STAGE_DAY_RANGE[stage];
  const d = lo + Math.random() * (hi - lo);
  return new Date(Date.now() - d * 86_400_000);
}

/** Create (or reuse) the 56-person demo applicant pool, returned in
 *  index order so per-posting assignment is stable. */
async function ensureDemoApplicants(): Promise<{ id: string; name: string }[]> {
  await prisma.user.createMany({
    data: APPLICANT_POOL.map((name, i) => ({
      email:       applicantEmail(i),
      name,
      role:        "trainee",
      accountKind: "demo",
    })),
    skipDuplicates: true,
  });

  const emails = APPLICANT_POOL.map((_, i) => applicantEmail(i));
  const rows = await prisma.user.findMany({
    where:  { email: { in: emails } },
    select: { id: true, name: true, email: true },
  });
  const byEmail = new Map(rows.map((r) => [r.email, r]));

  return APPLICANT_POOL.map((name, i) => {
    const r = byEmail.get(applicantEmail(i));
    return { id: r?.id ?? "", name: r?.name ?? name };
  });
}

// Reporting suite — applicant source attribution. Weighted so a few
// channels dominate, like a realistic talent funnel.
const SOURCE_POOL: string[] = [
  ...Array(45).fill("bhn_board"),
  ...Array(20).fill("referral"),
  ...Array(15).fill("employer_site"),
  ...Array(12).fill("direct_email"),
  ...Array(8).fill("talent_pool"),
];
function pickSource(): string {
  return SOURCE_POOL[Math.floor(Math.random() * SOURCE_POOL.length)];
}

// ── Reporting demo: transition history + scorecards + activity ──
const HISTORY_ORDER = ["new", "reviewing", "shortlisted", "phone_screen", "onsite", "offer", "hired"];

const SCORECARD_CRITERIA = [
  { id: "c_tech", label: "Technical / domain skills", scale: 5 },
  { id: "c_comm", label: "Communication",             scale: 5 },
  { id: "c_fit",  label: "Team / culture fit",        scale: 5 },
  { id: "c_prob", label: "Problem solving",           scale: 5 },
];

// Voluntary DEI self-ID pools for the demo. Distributions are
// suppression-safe at company scale; "Prefer not to say" is a real
// category, not a null.
const DEMO_GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"];
const DEMO_RACES = ["Asian", "Black", "Hispanic / Latino", "White", "Middle Eastern", "Prefer not to say"];

interface ChainEvent { fromStage: string | null; toStage: string; changedAt: Date; }

/** new → … → current stage, final event at `enteredAt`, earlier events
 *  spaced back a few days. Rejected apps walk to a weighted rejection
 *  point then drop — so cohort "furthest stage reached" is realistic. */
function buildChain(status: string, enteredAt: Date): ChainEvent[] {
  let path: string[];
  if (status === "rejected") {
    const rejFrom = ["reviewing", "shortlisted", "phone_screen"][Math.floor(Math.random() * 3)];
    path = HISTORY_ORDER.slice(0, HISTORY_ORDER.indexOf(rejFrom) + 1).concat(["rejected"]);
  } else {
    const idx = HISTORY_ORDER.indexOf(status);
    path = idx < 0 ? ["new", status] : HISTORY_ORDER.slice(0, idx + 1);
  }
  const out: ChainEvent[] = [];
  let cur = enteredAt.getTime();
  for (let i = path.length - 1; i >= 0; i--) {
    out.unshift({ fromStage: i === 0 ? null : path[i - 1], toStage: path[i], changedAt: new Date(cur) });
    cur -= (2 + Math.floor(Math.random() * 4)) * 86_400_000;
  }
  return out;
}

/** Scorecard scores keyed by SCORECARD_CRITERIA; skews higher for hires. */
function buildScores(hired: boolean): Record<string, { score: number }> {
  const lo = hired ? 4 : 3;
  const out: Record<string, { score: number }> = {};
  for (const c of SCORECARD_CRITERIA) out[c.id] = { score: Math.min(5, lo + Math.floor(Math.random() * 2)) };
  return out;
}

/**
 * Seed the caller's employer workspace: 3 postings with a decaying
 * applicant funnel, interviews, offers, scorecards, activity log, costs
 * and hiring targets. Extracted from the POST route so the demo-mode
 * nightly reset can rebuild the employer world without a session.
 */
export async function seedEmployerWorld(userId: string, realRole: string) {
  // Use the caller's display name for companyName fall-back so the
  // demo postings carry SOMETHING legible if the company-profile
  // field is empty (common on day-one accounts).
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { employerCompany: true, email: true, companyWebsite: true },
  });
  const companyName = me?.employerCompany?.trim()
    || (me?.email?.split("@")[1]?.split(".")[0] ?? "Acme Bio");

  // Resolve the caller's workspace company so the seeded postings carry
  // the SAME companyId every /employer read path filters by (postings,
  // analytics, calendar all read posting.companyId). Uses the shared
  // resolver keyed on REAL role so admins/superadmins (incl. view-as-
  // employer) resolve to their private preview company — exactly what
  // the read pages resolve. Without this, seed-writes and page-reads
  // land on different companies and the data is invisible.
  const activeCompanyId = await resolveWorkspaceCompanyId(userId, realRole).catch(() => null);

  const applicants = await ensureDemoApplicants();
  if (applicants.some((a) => !a.id)) {
    return { ok: false as const, error: "Failed to provision demo applicants" };
  }

  let postingsCreated = 0;
  let applicationsCreated = 0;
  let interviewsCreated = 0;
  let offersCreated = 0;
  const createdPostingIds: string[] = [];

  for (let i = 0; i < POSTING_TEMPLATES.length; i++) {
    const tpl = POSTING_TEMPLATES[i];

    // Stagger created-at so postings don't share a timestamp.
    const posting = await prisma.internshipPosting.create({
      data: {
        isDemoSeed: true,
        companyName,
        website: me?.companyWebsite ?? null,
        title: tpl.title,
        duration: tpl.duration,
        hours: tpl.hours,
        location: tpl.location,
        type: tpl.type,
        compensation: tpl.compensation,
        keySkills: tpl.keySkills,
        positionDetails: tpl.positionDetails,
        status: "active",
        deadline: daysAgo(-21), // 21 days in the future
        createdById: userId,
        companyId: activeCompanyId,
        createdAt: daysAgo(40 - i * 6), // older postings have deeper funnels
      },
      select: { id: true },
    });
    postingsCreated++;
    createdPostingIds.push(posting.id);

    // Walk the funnel, handing each slot the NEXT applicant from the
    // pool (offset per posting so different roles draw overlapping-but-
    // shifted people — the same applicant can appear in two postings).
    let cursor = i * 17;
    const next = () => applicants[cursor++ % applicants.length];

    const bulkApps: Prisma.ApplicationStatusCreateManyInput[] = [];
    const interviews: Prisma.InterviewCreateManyInput[] = [];
    const offerSlots: { applicantId: string; name: string; kind: "offer" | "hired"; enteredAt: Date }[] = [];

    let coverIdx = 0;
    let rejIdx = 0;

    for (const stage of FUNNEL_ORDER) {
      const count = tpl.funnel[stage];
      for (let k = 0; k < count; k++) {
        const a = next();
        const enteredAt = randDaysAgo(stage);

        if (stage === "offer" || stage === "hired") {
          // Needs its ApplicationStatus id to attach an Offer — created
          // individually below.
          offerSlots.push({ applicantId: a.id, name: a.name, kind: stage, enteredAt });
          continue;
        }

        bulkApps.push({
          postingId:   posting.id,
          applicantId: a.id,
          status:      stage,
          stageEnteredAt: enteredAt,
          coverLetter: COVER_LETTER_VARIANTS[coverIdx++ % COVER_LETTER_VARIANTS.length](tpl.keySkills[0]),
          rejectionReason:
            stage === "rejected" ? REJECTION_REASONS[rejIdx++ % REJECTION_REASONS.length] : null,
          source: pickSource(),
        });

        // Interview rows for the two interviewing stages (feeds the
        // calendar + applicant detail; not read by analytics).
        if (stage === "phone_screen") {
          interviews.push({
            postingId: posting.id,
            applicantId: a.id,
            scheduledById: userId,
            status: "proposed",
            format: "phone",
            proposedSlots: [daysAgo(-2).toISOString(), daysAgo(-4).toISOString(), daysAgo(-6).toISOString()],
            notes: "Auto-seeded for demo. 30-min screen with the hiring manager.",
          });
        } else if (stage === "onsite") {
          interviews.push({
            postingId: posting.id,
            applicantId: a.id,
            scheduledById: userId,
            status: "accepted",
            format: "onsite",
            proposedSlots: [daysAgo(-3).toISOString(), daysAgo(-5).toISOString()],
            acceptedSlot: daysAgo(-3),
            location: tpl.location,
            notes: "Auto-seeded for demo. On-site loop: 3× 45-min panels + lab tour.",
          });
        }
      }
    }

    // Bulk write the simple stages + interviews for this posting.
    if (bulkApps.length) {
      await prisma.applicationStatus.createMany({ data: bulkApps });
      applicationsCreated += bulkApps.length;
    }
    if (interviews.length) {
      await prisma.interview.createMany({ data: interviews });
      interviewsCreated += interviews.length;
    }

    // Offer / hired rows — individual create to capture the
    // ApplicationStatus id, then attach the Offer.
    for (const slot of offerSlots) {
      const accepted = slot.kind === "hired";
      const appStatus = await prisma.applicationStatus.create({
        data: {
          postingId: posting.id,
          applicantId: slot.applicantId,
          status: slot.kind, // "offer" or "hired"
          stageEnteredAt: slot.enteredAt,
          coverLetter: COVER_LETTER_VARIANTS[coverIdx++ % COVER_LETTER_VARIANTS.length](tpl.keySkills[0]),
          source: pickSource(),
        },
        select: { id: true },
      });
      applicationsCreated++;

      await prisma.offer.create({
        data: {
          applicationStatusId: appStatus.id,
          postingId: posting.id,
          applicantId: slot.applicantId,
          createdById: userId,
          status: accepted ? "accepted" : "sent",
          templateKey: "paid_internship",
          body:
            `Dear ${slot.name},\n\n` +
            `We're thrilled to offer you the **${tpl.title}** position at ${companyName}.\n\n` +
            `**Compensation:** ${tpl.compensation}\n` +
            `**Duration:** ${tpl.duration}\n` +
            `**Location:** ${tpl.location}\n\n` +
            `Please reply by the deadline below to accept or decline.\n\n` +
            `Welcome aboard,\n${companyName} hiring team`,
          compensation: tpl.compensation,
          startDate: daysAgo(-14),
          hoursPerWeek: tpl.hours,
          location: tpl.location,
          acceptDeadline: accepted ? daysAgo(3) : daysAgo(-7),
          sentAt: accepted ? daysAgo(18) : daysAgo(3),
          respondedAt: accepted ? daysAgo(15) : null,
        },
      });
      offersCreated++;
    }
  }

  // ── Reporting demo: transition history, scorecards, activity ──
  // Powers cohort funnel + cycle time (history), quality-of-hire
  // (scorecards), and recruiter productivity (activity log) on the
  // seeded data. Scoped to the postings created in THIS batch so it
  // never double-writes across additive re-seeds.
  if (createdPostingIds.length) {
    const newApps = await prisma.applicationStatus.findMany({
      where: { postingId: { in: createdPostingIds } },
      select: { id: true, postingId: true, applicantId: true, status: true, stageEnteredAt: true },
    });

    // (a) One scorecard rubric per new posting.
    await prisma.interviewScorecard.createMany({
      data: createdPostingIds.map((postingId) => ({ postingId, criteria: SCORECARD_CRITERIA })),
      skipDuplicates: true,
    });
    const scorecards = await prisma.interviewScorecard.findMany({
      where: { postingId: { in: createdPostingIds } },
      select: { id: true, postingId: true },
    });
    const scorecardByPosting = new Map(scorecards.map((s) => [s.postingId, s.id]));

    // Actors/interviewers: the company's demo team members if seeded,
    // else the seeding account.
    const demoMembers = activeCompanyId
      ? await prisma.companyMember
          .findMany({ where: { companyId: activeCompanyId, user: { accountKind: "demo" } }, select: { userId: true } })
          .catch(() => [] as { userId: string }[])
      : [];
    const actorIds = demoMembers.length ? demoMembers.map((m) => m.userId) : [userId];
    const pickActor = (i: number) => actorIds[i % actorIds.length];

    // (b) Transition-history chains.
    const historyRows = newApps.flatMap((a) =>
      buildChain(a.status, a.stageEnteredAt).map((e) => ({
        applicationStatusId: a.id,
        postingId:           a.postingId,
        fromStage:           e.fromStage,
        toStage:             e.toStage,
        changedAt:           e.changedAt,
        isDemoSeed:          true,
      })),
    );
    if (historyRows.length) await prisma.applicationStatusHistory.createMany({ data: historyRows });

    // (c) Scorecard submissions for advanced-stage candidates.
    const ADVANCED = new Set(["onsite", "offer", "hired"]);
    const scoreRows: Prisma.ScorecardSubmissionCreateManyInput[] = newApps
      .filter((a) => ADVANCED.has(a.status) && scorecardByPosting.has(a.postingId))
      .map((a, i) => ({
        scorecardId:         scorecardByPosting.get(a.postingId)!,
        applicationStatusId: a.id,
        interviewerId:       pickActor(i),
        scores:              buildScores(a.status === "hired"),
        recommendation:      a.status === "hired" ? "strong_yes" : a.status === "offer" ? "yes" : i % 2 ? "yes" : "no_decision",
        status:              "submitted",
        submittedAt:         a.stageEnteredAt,
      }));
    if (scoreRows.length) await prisma.scorecardSubmission.createMany({ data: scoreRows, skipDuplicates: true });

    // (d) Activity log → recruiter productivity. A spread of kinds.
    if (activeCompanyId) {
      const acts: Prisma.EmployerActivityLogCreateManyInput[] = [];
      let ai = 0;
      for (const postingId of createdPostingIds) {
        acts.push({ companyId: activeCompanyId, actorId: pickActor(ai++), kind: "posting_created", payload: {}, postingId, createdAt: daysAgo(38) });
      }
      for (const a of newApps) {
        const actor = pickActor(ai++);
        if (a.status !== "new") acts.push({ companyId: activeCompanyId, actorId: actor, kind: "stage_changed", payload: { to: a.status }, postingId: a.postingId, applicantId: a.applicantId, createdAt: a.stageEnteredAt });
        if (a.status === "phone_screen" || a.status === "onsite") acts.push({ companyId: activeCompanyId, actorId: actor, kind: "interview_scheduled", payload: {}, postingId: a.postingId, applicantId: a.applicantId, createdAt: a.stageEnteredAt });
        if (ADVANCED.has(a.status)) acts.push({ companyId: activeCompanyId, actorId: actor, kind: "scorecard_submitted", payload: {}, postingId: a.postingId, applicantId: a.applicantId, createdAt: a.stageEnteredAt });
        if (a.status === "offer" || a.status === "hired") acts.push({ companyId: activeCompanyId, actorId: actor, kind: "offer_sent", payload: {}, postingId: a.postingId, applicantId: a.applicantId, createdAt: a.stageEnteredAt });
        if (a.status === "hired") acts.push({ companyId: activeCompanyId, actorId: actor, kind: "applicant_hired", payload: {}, postingId: a.postingId, applicantId: a.applicantId, createdAt: a.stageEnteredAt });
      }
      if (acts.length) await prisma.employerActivityLog.createMany({ data: acts });
    }

    // (e) Voluntary demographics (consent=true) for the DEI report.
    // ~2/3 opt in; the report only surfaces them if the company turns
    // DEI reporting on (off by default), and always suppresses small cells.
    const demoRows = newApps
      .filter((_, i) => i % 3 !== 0)
      .map((a) => ({
        applicationStatusId: a.id,
        consent:          true,
        gender:           DEMO_GENDERS[Math.floor(Math.random() * DEMO_GENDERS.length)],
        raceEthnicity:    DEMO_RACES[Math.floor(Math.random() * DEMO_RACES.length)],
        disabilityStatus: Math.random() < 0.12 ? "Yes" : "No",
        veteranStatus:    Math.random() < 0.08 ? "Yes" : "No",
        consentedAt:      a.stageEnteredAt,
        consentVersion:   "v1",
        isDemoSeed:       true,
      }));
    if (demoRows.length) await prisma.applicationDemographics.createMany({ data: demoRows, skipDuplicates: true });
  }

  // ── Reporting suite: company-scoped costs + targets (OKRs) ──
  // REPLACE semantics (delete the demo set, recreate) so re-seeding
  // doesn't double the spend or duplicate targets — unlike postings,
  // which are additive. Gated by isDemoSeed so real data is untouched.
  let costsCreated = 0;
  let targetsCreated = 0;
  if (activeCompanyId) {
    await prisma.recruitingCost.deleteMany({ where: { companyId: activeCompanyId, isDemoSeed: true } });
    await prisma.hiringTarget.deleteMany({ where: { companyId: activeCompanyId, isDemoSeed: true } });

    const COST_ROWS = [
      { costType: "advertising",    amount: 2400, days: 35 },
      { costType: "advertising",    amount: 1800, days: 18 },
      { costType: "agency_fee",     amount: 6000, days: 28 },
      { costType: "referral_bonus", amount: 1500, days: 12 },
      { costType: "tooling",        amount: 900,  days: 40 },
      { costType: "events",         amount: 1200, days: 22 },
      { costType: "other",          amount: 350,  days: 6 },
    ];
    await prisma.recruitingCost.createMany({
      data: COST_ROWS.map((c) => ({
        companyId:   activeCompanyId,
        costType:    c.costType,
        amount:      c.amount,
        currency:    "CAD",
        incurredAt:  daysAgo(c.days),
        isDemoSeed:  true,
        createdById: userId,
      })),
    });
    costsCreated = COST_ROWS.length;

    // A mix tuned against the seeded actuals so RAG shows green/amber/red.
    const TARGET_ROWS = [
      { metricKey: "hires",              targetValue: 5,    comparator: "gte" }, // actual 3 → off track
      { metricKey: "applications",       targetValue: 60,   comparator: "gte" }, // actual ~88 → on track
      { metricKey: "time_to_fill_days",  targetValue: 30,   comparator: "lte" },
      { metricKey: "offer_accept_rate",  targetValue: 70,   comparator: "gte" }, // actual high → on track
      { metricKey: "apply_to_hire_rate", targetValue: 4,    comparator: "gte" },
      { metricKey: "cost_per_hire",      targetValue: 4500, comparator: "lte" }, // actual ~higher → at risk/off
    ];
    await prisma.hiringTarget.createMany({
      data: TARGET_ROWS.map((t) => ({
        companyId:   activeCompanyId,
        metricKey:   t.metricKey,
        targetValue: t.targetValue,
        comparator:  t.comparator,
        period:      "quarter",
        isDemoSeed:  true,
        createdById: userId,
      })),
    });
    targetsCreated = TARGET_ROWS.length;
  }

  return {
    ok: true as const,
    postingsCreated,
    applicationsCreated,
    interviewsCreated,
    offersCreated,
    costsCreated,
    targetsCreated,
  };
}

/** Sweep isDemoSeed postings (cascades take applications, interviews,
 *  offers) plus company-scoped demo costs/targets. Counterpart of
 *  seedEmployerWorld; the demo applicant pool is left for reuse. */
export async function clearEmployerWorld(userId: string, realRole: string) {
  // Cascades down: ApplicationStatus → Interview / Offer / etc. all
  // FK to the posting with onDelete: Cascade.
  //
  // Clear by BOTH createdById (legacy seeds + the caller's own) AND
  // the active companyId (so a teammate's company-scoped demo seeds
  // are also swept, and so seeds created after the companyId fix are
  // caught regardless of who in the company created them). Always
  // gated by isDemoSeed so real postings are never touched. The demo
  // applicant pool is intentionally left intact (reused next seed).
  const activeCompanyId = await resolveWorkspaceCompanyId(userId, realRole).catch(() => null);
  const result = await prisma.internshipPosting.deleteMany({
    where: {
      isDemoSeed: true,
      OR: [
        { createdById: userId },
        ...(activeCompanyId ? [{ companyId: activeCompanyId }] : []),
      ],
    },
  });

  // Reporting suite: sweep company-scoped demo costs + targets (they
  // don't hang off a posting, so the cascade above doesn't reach them).
  // Gated by isDemoSeed so real cost/target rows are never touched.
  if (activeCompanyId) {
    await prisma.recruitingCost.deleteMany({ where: { companyId: activeCompanyId, isDemoSeed: true } });
    await prisma.hiringTarget.deleteMany({ where: { companyId: activeCompanyId, isDemoSeed: true } });
  }

  return { ok: true as const, deleted: result.count };
}
