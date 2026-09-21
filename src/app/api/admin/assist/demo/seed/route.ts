/**
 * Admin-only seed/clear pair for the AI assist surfaces.
 *
 *   POST   /api/admin/assist/demo/seed   → create six throwaway
 *                                           trainees + a week of
 *                                           AssistEvent / Rollup /
 *                                           WeeklySummary / Hint /
 *                                           Preferences rows
 *   DELETE /api/admin/assist/demo/seed   → wipe the same users
 *                                           (cascading FKs sweep
 *                                            every assist row)
 *
 * Why this exists
 *   /admin/assist is meaningless on an empty database — none of the
 *   "top stuck surface", "helpfulness by card", "latest weekly
 *   findings" sections have rows to render. This endpoint lets an
 *   admin spin up a realistic snapshot in one click so the page is
 *   demoable.
 *
 * Markings
 *   Demo trainees use a fixed email pattern (`assist-demo-{slug}@
 *   bhn.test`) and `accountKind = "demo"`. The clear path finds them
 *   by email LIKE so it stays a single round-trip; AssistEvent /
 *   Rollup / Summary / Hint / Preferences all cascade off User.
 *
 * Caveats
 *   • Hints carry snapshotted title/body so registry edits don't
 *     retroactively rewrite seeded rows. We pull from
 *     `findHelpCard()` at seed time.
 *   • Times use the current wall clock (UTC) so the freshly seeded
 *     rows always fall inside the dashboard's "last 7 days" cuts.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { findHelpCard } from "@/lib/assist/help-cards";

export const runtime = "nodejs";

/** Six demo trainees, each shaped around a different stuck-pattern
 *  so the admin sees variety in the dashboard. The first field is
 *  the email slug. */
const DEMO_USERS: {
  slug: string;
  name: string;
  /** Free-form label printed in seeded weekly summaries. */
  archetype: string;
  /** Which surfaces this user spent time on this week. */
  surfaces: string[];
}[] = [
  {
    slug: "alex",
    name: "Alex Chen (demo)",
    archetype: "rage-clicking through HR postings",
    surfaces: ["/employer/postings", "/employer"],
  },
  {
    slug: "priya",
    name: "Priya Patel (demo)",
    archetype: "abandoning the new-posting form",
    surfaces: ["/employer/postings/new", "/employer/postings"],
  },
  {
    slug: "marcus",
    name: "Marcus Williams (demo)",
    archetype: "hit the same client error twice",
    surfaces: ["/courses", "/dashboard"],
  },
  {
    slug: "sara",
    name: "Sara Mendez (demo)",
    archetype: "stuck deciding on the course catalog",
    surfaces: ["/courses"],
  },
  {
    slug: "jordan",
    name: "Jordan Kim (demo)",
    archetype: "pending approvals piling up",
    surfaces: ["/admin", "/admin/credit-applications"],
  },
  {
    slug: "olivia",
    name: "Olivia Brown (demo)",
    archetype: "happy path — finished the tour and a course",
    surfaces: ["/dashboard", "/courses"],
  },
];

const DEMO_EMAIL_PREFIX = "assist-demo-";
const DEMO_EMAIL_SUFFIX = "@bhn.test";

function emailFor(slug: string): string {
  return `${DEMO_EMAIL_PREFIX}${slug}${DEMO_EMAIL_SUFFIX}`;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Last Monday at 00:00 UTC. Matches the weekly cron's bucketing. */
function lastMondayUTC(): Date {
  const x = startOfDayUTC(new Date());
  const dow = x.getUTCDay(); // 0 = Sun
  const offset = dow === 0 ? 6 : dow - 1;
  x.setUTCDate(x.getUTCDate() - offset);
  return x;
}

/** Mini event-factory. Picks the timestamp inside the trailing 7-day
 *  window so admin "last 30 days" cuts always pick this up. */
function eventRow(
  userId: string,
  sessionId: string,
  hAgo: number,
  kind: string,
  surface: string,
  target: string | null,
  payload: Record<string, unknown> | null = null,
): Prisma.AssistEventCreateManyInput {
  return {
    userId,
    sessionId,
    ts: hoursAgo(hAgo),
    kind,
    surface,
    target,
    payload: (payload as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
  };
}

/** Builds the full week of behavior for a single archetype. The
 *  shape is hand-tuned so the rule-engine + dashboard pre-cuts
 *  light up appropriately. */
function eventsForArchetype(userId: string, sessionId: string, archetypeSlug: string): Prisma.AssistEventCreateManyInput[] {
  const e = eventRow;
  switch (archetypeSlug) {
    case "alex": // rage-clicking through HR postings
      return [
        e(userId, sessionId, 168, "surface.view", "/employer/postings", null),
        e(userId, sessionId, 167, "click", "/employer/postings", "New posting button"),
        e(userId, sessionId, 167, "rage_click", "/employer/postings", "New posting button", { count: 4 }),
        e(userId, sessionId, 167, "rage_click", "/employer/postings", "New posting button", { count: 5 }),
        e(userId, sessionId, 96, "surface.view", "/employer/postings", null),
        e(userId, sessionId, 95, "rage_click", "/employer/postings", "Filter pill: active", { count: 3 }),
        e(userId, sessionId, 50, "surface.view", "/employer", null),
        e(userId, sessionId, 49, "click", "/employer", "Edit profile button"),
        e(userId, sessionId, 48, "dwell", "/employer/postings", null, { ms: 240000 }),
        e(userId, sessionId, 6, "surface.view", "/employer/postings", null),
        e(userId, sessionId, 6, "rage_click", "/employer/postings", "Edit posting button", { count: 3 }),
      ];
    case "priya": // form-abandon on /employer/postings/new
      return [
        e(userId, sessionId, 144, "surface.view", "/employer/postings/new", null),
        e(userId, sessionId, 144, "form.focus", "/employer/postings/new", "Title field"),
        e(userId, sessionId, 144, "form.field_complete", "/employer/postings/new", "Title field"),
        e(userId, sessionId, 143, "form.abandon", "/employer/postings/new", "New posting form", { filled: 2, total: 9 }),
        e(userId, sessionId, 72, "surface.view", "/employer/postings/new", null),
        e(userId, sessionId, 72, "form.focus", "/employer/postings/new", "Description field"),
        e(userId, sessionId, 71, "form.abandon", "/employer/postings/new", "New posting form", { filled: 3, total: 9 }),
        e(userId, sessionId, 24, "surface.view", "/employer/postings/new", null),
        e(userId, sessionId, 24, "form.focus", "/employer/postings/new", "Title field"),
        e(userId, sessionId, 24, "dwell", "/employer/postings/new", null, { ms: 480000 }),
        e(userId, sessionId, 23, "form.abandon", "/employer/postings/new", "New posting form", { filled: 4, total: 9 }),
      ];
    case "marcus": // error loop
      return [
        e(userId, sessionId, 120, "surface.view", "/courses", null),
        e(userId, sessionId, 120, "click", "/courses", "Catalog search"),
        e(userId, sessionId, 119, "error.client", "/courses", "Search dropdown", { message: "TypeError: ranking undefined" }),
        e(userId, sessionId, 119, "error.client", "/courses", "Search dropdown", { message: "TypeError: ranking undefined" }),
        e(userId, sessionId, 48, "surface.view", "/dashboard", null),
        e(userId, sessionId, 47, "click", "/dashboard", "Resume course card"),
        e(userId, sessionId, 47, "error.client", "/dashboard", "Resume course card", { message: "fetch /api/courses/resume failed" }),
        e(userId, sessionId, 47, "error.client", "/dashboard", "Resume course card", { message: "fetch /api/courses/resume failed" }),
        e(userId, sessionId, 4, "surface.view", "/courses", null),
      ];
    case "sara": // long dwell on catalog
      return [
        e(userId, sessionId, 96, "surface.view", "/courses", null),
        e(userId, sessionId, 96, "dwell", "/courses", null, { ms: 720000 }),
        e(userId, sessionId, 48, "surface.view", "/courses", null),
        e(userId, sessionId, 47, "click", "/courses", "Filter pill: cleanroom"),
        e(userId, sessionId, 47, "dwell", "/courses", null, { ms: 900000 }),
        e(userId, sessionId, 12, "surface.view", "/courses", null),
        e(userId, sessionId, 11, "idle.start", "/courses", null),
        e(userId, sessionId, 11, "idle.end", "/courses", null, { ms: 180000 }),
      ];
    case "jordan": // pending approvals
      return [
        e(userId, sessionId, 144, "surface.view", "/admin", null),
        e(userId, sessionId, 143, "click", "/admin", "Pending approvals tile"),
        e(userId, sessionId, 143, "surface.view", "/admin/credit-applications", null),
        e(userId, sessionId, 143, "dwell", "/admin/credit-applications", null, { ms: 300000 }),
        e(userId, sessionId, 72, "surface.view", "/admin", null),
        e(userId, sessionId, 71, "click", "/admin", "Pending approvals tile"),
        e(userId, sessionId, 71, "form.submit_attempt", "/admin/credit-applications", "Approve button"),
        e(userId, sessionId, 6, "surface.view", "/admin", null),
      ];
    case "olivia": // happy path
      return [
        e(userId, sessionId, 144, "surface.view", "/dashboard", null),
        e(userId, sessionId, 143, "click", "/dashboard", "Welcome tour CTA"),
        e(userId, sessionId, 96, "surface.view", "/courses", null),
        e(userId, sessionId, 96, "click", "/courses", "Open course: Cleanroom gowning"),
        e(userId, sessionId, 48, "form.submit_attempt", "/courses", "Quiz submit button"),
        e(userId, sessionId, 4, "surface.view", "/dashboard", null),
        e(userId, sessionId, 4, "click", "/dashboard", "Continue learning card"),
      ];
    default:
      return [];
  }
}

/** Rollup row builder. The dashboard groups by `day` + `surface`, so
 *  we emit one row per day in the user's surface set. */
function rollupRows(
  userId: string,
  archetypeSlug: string,
  surfaces: string[],
): Prisma.AssistDailyRollupCreateManyInput[] {
  const out: Prisma.AssistDailyRollupCreateManyInput[] = [];
  for (let d = 0; d < 7; d++) {
    const day = startOfDayUTC(daysAgo(d));
    for (const surface of surfaces) {
      // Tweak the counts so rage / errors / abandons match the
      // archetype the user is playing.
      const isToday = d === 0;
      const base: Prisma.AssistDailyRollupCreateManyInput = {
        userId,
        surface,
        day,
        views: 2 + (isToday ? 1 : 0),
        clicks: 4 + d,
        rageClicks: 0,
        deadClicks: 0,
        formAbandons: 0,
        errors: 0,
        dwellMs: 120000 + d * 30000,
        completed: false,
      };
      if (archetypeSlug === "alex" && surface === "/employer/postings") {
        base.rageClicks = d < 3 ? 3 : 1;
        base.deadClicks = 1;
      }
      if (archetypeSlug === "priya" && surface === "/employer/postings/new") {
        base.formAbandons = 1;
        base.dwellMs = 480000;
      }
      if (archetypeSlug === "marcus") {
        base.errors = d < 3 ? 2 : 0;
      }
      if (archetypeSlug === "sara" && surface === "/courses") {
        base.dwellMs = 900000;
      }
      if (archetypeSlug === "jordan" && surface === "/admin") {
        base.views = 3;
      }
      if (archetypeSlug === "olivia") {
        base.completed = d < 4;
      }
      out.push(base);
    }
  }
  return out;
}

/** Two seeded hints per user spanning different statuses + triggers
 *  so the admin "recent hints" + "helpfulness by card" tables have
 *  something to chart. */
function hintRows(userId: string, archetypeSlug: string): Prisma.AssistHintCreateManyInput[] {
  const now = new Date();
  const out: Prisma.AssistHintCreateManyInput[] = [];

  // Helper to pull snapshotted title/body from the registry.
  const snapshot = (helpKey: string) => {
    const card = findHelpCard(helpKey);
    return {
      title: card?.title ?? helpKey,
      body: card?.body ?? "",
      ctaLabel: card?.ctaLabel ?? null,
      ctaHref: card?.ctaHref ?? null,
    };
  };

  const ttl = 30 * 60 * 1000; // 30 min

  const profile: Record<string, { helpKey: string; surface: string; trigger: string; status: string; confidence: number; createdAgoHr: number; resolvedAgoHr?: number }[]> = {
    alex: [
      { helpKey: "stuck.rage-click", surface: "/employer/postings", trigger: "rule:rage-click", status: "dismissed", confidence: 0.86, createdAgoHr: 96, resolvedAgoHr: 95 },
      { helpKey: "employer.demo.seed", surface: "/employer/postings", trigger: "ai:claude-haiku", status: "clicked", confidence: 0.79, createdAgoHr: 24, resolvedAgoHr: 23 },
    ],
    priya: [
      { helpKey: "stuck.form-abandon", surface: "/employer/postings/new", trigger: "rule:form-abandon", status: "shown", confidence: 0.81, createdAgoHr: 22 },
      { helpKey: "employer.profile.set-up", surface: "/employer/postings/new", trigger: "ai:claude-haiku", status: "ignored", confidence: 0.72, createdAgoHr: 60, resolvedAgoHr: 59 },
    ],
    marcus: [
      { helpKey: "stuck.error-loop", surface: "/courses", trigger: "rule:error-loop", status: "shown", confidence: 0.88, createdAgoHr: 5 },
      { helpKey: "stuck.error-loop", surface: "/dashboard", trigger: "rule:error-loop", status: "clicked", confidence: 0.82, createdAgoHr: 46, resolvedAgoHr: 45 },
    ],
    sara: [
      { helpKey: "stuck.long-dwell", surface: "/courses", trigger: "rule:long-dwell", status: "dismissed", confidence: 0.77, createdAgoHr: 40, resolvedAgoHr: 39 },
      { helpKey: "trainee.catalog.search", surface: "/courses", trigger: "ai:claude-haiku", status: "clicked", confidence: 0.83, createdAgoHr: 10, resolvedAgoHr: 9 },
    ],
    jordan: [
      { helpKey: "admin.queue.review", surface: "/admin", trigger: "rule:pending-approvals", status: "clicked", confidence: 0.91, createdAgoHr: 70, resolvedAgoHr: 69 },
      { helpKey: "admin.users.bulk-actions", surface: "/admin", trigger: "ai:claude-haiku", status: "shown", confidence: 0.74, createdAgoHr: 4 },
    ],
    olivia: [
      { helpKey: "trainee.welcome.tour", surface: "/dashboard", trigger: "ai:claude-haiku", status: "clicked", confidence: 0.79, createdAgoHr: 140, resolvedAgoHr: 139 },
      { helpKey: "returning.continue-where-you-left", surface: "/dashboard", trigger: "rule:returning-user", status: "clicked", confidence: 0.85, createdAgoHr: 3, resolvedAgoHr: 2 },
    ],
  };

  const items = profile[archetypeSlug] ?? [];
  for (const it of items) {
    const snap = snapshot(it.helpKey);
    const createdAt = hoursAgo(it.createdAgoHr);
    const resolvedAt = it.resolvedAgoHr !== undefined ? hoursAgo(it.resolvedAgoHr) : null;
    out.push({
      userId,
      helpKey: it.helpKey,
      title: snap.title,
      body: snap.body,
      ctaLabel: snap.ctaLabel,
      ctaHref: snap.ctaHref,
      surface: it.surface,
      triggeredBy: it.trigger,
      confidence: it.confidence,
      status: it.status,
      shownAt: it.status === "pending" ? null : (resolvedAt ?? new Date(createdAt.getTime() + 60000)),
      resolvedAt: it.status === "pending" || it.status === "shown" ? null : resolvedAt,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + ttl),
    });
  }

  // Tag with present-time fallback for pending/shown TTL freshness.
  for (const row of out) {
    if (row.status === "shown" || row.status === "pending") {
      row.expiresAt = new Date(now.getTime() + ttl);
    }
  }

  return out;
}

/** Summary text per archetype. Hand-written for realism — the
 *  actual weekly cron uses Claude for this; the seed just snapshots
 *  representative output. */
function summaryText(archetypeSlug: string): { summary: string; stuckOn: string[] } {
  switch (archetypeSlug) {
    case "alex":
      return {
        summary: "Spent the week on /employer/postings trying to launch a new role. Hit the New posting button repeatedly and never made it into the form — looks like the button is firing slowly or silently. Followed by some Filter-pill rage on the listings page. No completed actions.",
        stuckOn: ["/employer/postings"],
      };
    case "priya":
      return {
        summary: "Started the new-posting form three times across the week, filled in 2-4 fields each pass, and abandoned each session. Long dwells before each drop. Strong signal the form needs a save-draft or a clearer entry point.",
        stuckOn: ["/employer/postings/new"],
      };
    case "marcus":
      return {
        summary: "Hit the same client error twice on /courses (catalog search) and twice on /dashboard (resume-course card). Did not complete anything. Likely a deploy regression — both errors share a fetch-failure pattern.",
        stuckOn: ["/courses", "/dashboard"],
      };
    case "sara":
      return {
        summary: "Spent the week on the course catalog with long dwells (12-15 minutes each session) and minimal clicks. Reads as decision paralysis rather than confusion. Catalog-search hint clicked on the most recent session.",
        stuckOn: ["/courses"],
      };
    case "jordan":
      return {
        summary: "Approvals work — opened /admin three times, drilled into credit applications, and submitted one approval. No stuck signals; this is the queue working as intended.",
        stuckOn: [],
      };
    case "olivia":
      return {
        summary: "Completed the welcome tour, started a Cleanroom-gowning course, and submitted the first quiz. Returning-user hint clicked on a follow-up session. Healthy onboarding trajectory.",
        stuckOn: [],
      };
    default:
      return { summary: "No data.", stuckOn: [] };
  }
}

export async function POST() {
  await requireRole("admin");

  const weekStart = lastMondayUTC();
  let usersCreated = 0;
  let eventsCreated = 0;
  let rollupsCreated = 0;
  let summariesCreated = 0;
  let hintsCreated = 0;

  for (const archetype of DEMO_USERS) {
    const email = emailFor(archetype.slug);
    // Upsert so re-seeding doesn't bloat the table; we then wipe
    // each user's children before re-seeding fresh rows.
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: archetype.name,
        role: "trainee",
        accountKind: "demo",
      },
      update: {},
      select: { id: true },
    });
    usersCreated++;

    // Wipe existing children so re-runs produce a clean snapshot.
    await prisma.$transaction([
      prisma.assistEvent.deleteMany({ where: { userId: user.id } }),
      prisma.assistDailyRollup.deleteMany({ where: { userId: user.id } }),
      prisma.assistWeeklySummary.deleteMany({ where: { userId: user.id } }),
      prisma.assistHintFeedback.deleteMany({ where: { userId: user.id } }),
      prisma.assistHint.deleteMany({ where: { userId: user.id } }),
    ]);

    // Preferences — opt them into collection so the dashboard counts
    // them as "active assist users".
    await prisma.assistPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        consented: true,
        consentedAt: daysAgo(14),
        hintsDisabled: false,
        confidenceThreshold: 0.75,
      },
      update: {
        consented: true,
        consentedAt: daysAgo(14),
        hintsDisabled: false,
        confidenceThreshold: 0.75,
        suppressUntil: null,
      },
    });

    // Events.
    const sessionId = `demo-session-${archetype.slug}`;
    const events = eventsForArchetype(user.id, sessionId, archetype.slug);
    if (events.length > 0) {
      await prisma.assistEvent.createMany({ data: events });
      eventsCreated += events.length;
    }

    // Rollups.
    const rollups = rollupRows(user.id, archetype.slug, archetype.surfaces);
    if (rollups.length > 0) {
      await prisma.assistDailyRollup.createMany({ data: rollups, skipDuplicates: true });
      rollupsCreated += rollups.length;
    }

    // Weekly summary.
    const summary = summaryText(archetype.slug);
    await prisma.assistWeeklySummary.create({
      data: {
        userId: user.id,
        weekStart,
        summary: summary.summary,
        stuckOn: summary.stuckOn,
      },
    });
    summariesCreated++;

    // Hints.
    const hints = hintRows(user.id, archetype.slug);
    for (const h of hints) {
      const created = await prisma.assistHint.create({ data: h, select: { id: true } });
      hintsCreated++;
      // Mirror the shown/clicked/dismissed status into the
      // feedback table so the admin "helpfulness" computation has
      // matching rows.
      if (h.status === "shown" || h.status === "clicked" || h.status === "dismissed" || h.status === "ignored") {
        await prisma.assistHintFeedback.create({
          data: {
            userId: user.id,
            hintId: created.id,
            kind: "shown",
            ts: (h.shownAt as Date) ?? new Date(),
          },
        });
      }
      if (h.status === "clicked" || h.status === "dismissed" || h.status === "ignored") {
        await prisma.assistHintFeedback.create({
          data: {
            userId: user.id,
            hintId: created.id,
            kind: h.status,
            ts: (h.resolvedAt as Date) ?? new Date(),
          },
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    usersCreated,
    eventsCreated,
    rollupsCreated,
    summariesCreated,
    hintsCreated,
  });
}

export async function DELETE() {
  await requireRole("admin");

  // Find all demo users matching our slug pattern; deleting the User
  // row cascades AssistEvent / Rollup / Summary / Hint / Feedback /
  // Preferences via the schema-defined onDelete: Cascade.
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
