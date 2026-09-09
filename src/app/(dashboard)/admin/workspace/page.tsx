/**
 * Workspace home — what is waiting on the team, in one place.
 *
 * /admin/workspace was a 404: eight sub-areas and no index. This is the
 * front door. Every lane is a count the sidebar also badges, and both
 * read the same rule (lib/admin/workspace-queue-rules.ts), so a badge
 * means exactly what a lane means. Under the lanes: signals that are not
 * counts (a stale list, an application nobody has touched in a week),
 * the last dozen things that happened, and every date the rows already
 * know about for the next 30 days.
 *
 * Reads only. Nothing here marks anything seen or done — the lanes link
 * to the pages that do.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Inbox, Rocket, Megaphone, Mic, SlidersHorizontal, Mail,
  AlertTriangle, CalendarClock, CheckCircle2, ArrowRight,
} from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { DSSection } from "@/components/design-system/DSSection";
import { QueueLane, type LaneTone } from "@/components/admin/QueueLane";
import { ActivityFeed, type ActivityRow } from "@/components/admin/ActivityFeed";
import { getWorkspaceQueueCounts } from "@/lib/admin/workspace-queue";
import {
  type WorkspaceBadgeKey,
  INSIGHTS_EVENT_SLUG,
  SYMPOSIUM_EVENT_SLUG,
  EQUIP_STALLED_SUBMITTED_DAYS,
  comingUpWindow,
  equipStalledWhere,
  torontoToday,
  trainingBookingsPendingWhere,
} from "@/lib/admin/workspace-queue-rules";
import { TERMINAL_STATUSES } from "@/lib/social/types";
import { STATUS_META, STREAM_META } from "@/lib/equip/types";
import { rosterState } from "@/lib/eligibility/check";
import { eligibilityGate } from "@/lib/eligibility/gate";
import { listCycles } from "@/lib/newsletter/calendar";

export const dynamic = "force-dynamic";

const HERE = "/admin/workspace";
const SOCIAL = "/admin/workspace/marketing/social";
const NEWSLETTER_CALENDAR = "/admin/workspace/marketing/newsletter/calendar";
const TRAINING_ADMIN = "/admin/workspace/training-admin";
const SYMPOSIUM_SPEAKERS = "/admin/workspace/symposium-2026/speakers";

const TZ = "America/Toronto";
const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const fmtWhen = (d: Date) =>
  d.toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** Newsletter milestones are "YYYY-MM-DD" strings; noon keeps the day label stable. */
const dayAt = (ymd: string) => new Date(`${ymd}T12:00:00`);
const humanise = (s: string) => s.replace(/_/g, " ");
/** The platform's own words for an EQUIP status/stream ("Not selected", "VentureLift"), not the slug. */
const statusLabel = (s: string) => (STATUS_META as Record<string, { label: string }>)[s]?.label ?? humanise(s);
const streamName = (s: string) => (STREAM_META as Record<string, { name: string }>)[s]?.name ?? humanise(s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Lane = { key: WorkspaceBadgeKey; href: string; icon: React.ElementType; label: string; tone: LaneTone };
const LANES: Lane[] = [
  { key: "equip-review",              href: "/admin/equip",       icon: Rocket,            label: "EQUIP to review",     tone: "brand"   },
  { key: "social-attention",          href: SOCIAL,               icon: Megaphone,         label: "Social posts",        tone: "violet"  },
  { key: "speakers-new-symposium",    href: SYMPOSIUM_SPEAKERS,   icon: Mic,               label: "Symposium speakers",  tone: "amber"   },
  { key: "speakers-new-insights",     href: `/admin/events/${INSIGHTS_EVENT_SLUG}/speakers`, icon: Mic, label: "Insights speakers", tone: "amber" },
  { key: "training-bookings-pending", href: TRAINING_ADMIN,       icon: SlidersHorizontal, label: "Training Week seats", tone: "emerald" },
  { key: "newsletter-attention",      href: NEWSLETTER_CALENDAR,  icon: Mail,              label: "Newsletter",          tone: "rose"    },
];

type Upcoming = { at: Date; kind: string; label: string; href: string };

export default async function WorkspaceHomePage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect(await deniedRedirect(HERE));

  const now = new Date();
  const today = torontoToday(now);
  const window = comingUpWindow(now, 30);
  const thisMonth = `${today.slice(0, 7)}-01`;

  const [
    counts, roster, stalledEquip, overdueSocial,
    recentEquip, recentSpeakers, recentSocial, recentBookings, recentReminders,
    deadlines, events, cycles, scheduledPosts,
  ] = await Promise.all([
    getWorkspaceQueueCounts(now),
    rosterState().catch(() => ({ total: 0, lastImportAt: null })),
    prisma.equipApplication.count({ where: equipStalledWhere(now) }).catch(() => 0),
    prisma.socialPost
      .count({ where: { status: { in: ["approved", "scheduled"] }, scheduledFor: { lt: now } } })
      .catch(() => 0),

    prisma.equipApplication.findMany({
      where: { status: { not: "draft" } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true, stream: true, status: true, applicantName: true, applicantEmail: true, updatedAt: true,
        user: { select: { name: true, email: true } },
      },
    }).catch(() => []),
    prisma.speaker.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 6,
      select: { id: true, fullName: true, organization: true, submittedAt: true, event: { select: { slug: true, title: true } } },
    }).catch(() => []),
    prisma.socialPost.findMany({
      where: { status: { notIn: [...TERMINAL_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, kind: true, status: true, scheduledFor: true, updatedAt: true },
    }).catch(() => []),
    prisma.workshopBooking.findMany({
      where: trainingBookingsPendingWhere(),
      orderBy: { bookedAt: "desc" },
      take: 6,
      select: {
        id: true, bookedAt: true,
        workshop: { select: { title: true } },
        user: { select: { name: true, email: true } },
        submission: { select: { email: true } },
      },
    }).catch(() => []),
    prisma.newsletterReminder.findMany({
      where: { sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 6,
      select: { id: true, kind: true, status: true, sentAt: true, cycle: { select: { month: true } } },
    }).catch(() => []),

    prisma.equipDeadline.findMany({
      where: { status: { in: ["open", "extended", "scheduled"] }, deadlineAt: { gte: window.from, lte: window.to } },
      orderBy: { deadlineAt: "asc" },
      select: { id: true, stream: true, cycleLabel: true, deadlineAt: true },
    }).catch(() => []),
    prisma.bhnEvent.findMany({
      where: { status: "published", startDate: { gte: window.from, lte: window.to } },
      orderBy: { startDate: "asc" },
      select: { slug: true, title: true, startDate: true },
    }).catch(() => []),
    // Three cycles, not two: a 30-day window from the 30th/31st reaches into
    // month+2, whose approval-due can precede its own month.
    listCycles(thisMonth, 3).catch(() => []),
    prisma.socialPost.findMany({
      where: { status: "scheduled", scheduledFor: { gte: window.from, lte: window.to } },
      orderBy: { scheduledFor: "asc" },
      select: { id: true, kind: true, scheduledFor: true },
    }).catch(() => []),
  ]);

  const total = counts["workspace-total"] ?? 0;

  // Signals — true things a person should know that are not a count of
  // work. The eligibility gate writes its own sentence; reuse it.
  const gate = eligibilityGate(roster, now);
  const attention: { text: string; href: string }[] = [];
  if (!gate.enforcing || gate.stale) attention.push({ text: gate.reason, href: "/admin/eligibility" });
  if (stalledEquip > 0) {
    attention.push({
      text: `${plural(stalledEquip, "EQUIP application")} untouched for more than ${EQUIP_STALLED_SUBMITTED_DAYS} days.`,
      href: "/admin/equip/overview",
    });
  }
  if (overdueSocial > 0) {
    attention.push({
      text: `${plural(overdueSocial, "approved social post")} past the send time and not marked done.`,
      href: SOCIAL,
    });
  }

  const rows: ActivityRow[] = [
    ...recentEquip.map((a) => ({
      kind: "EQUIP application",
      icon: Rocket,
      iconCls: "bg-brand-50 text-brand-700 border-brand-200",
      title: `${a.user?.name ?? a.applicantName ?? a.user?.email ?? a.applicantEmail ?? "Applicant"} · ${streamName(a.stream)}`,
      subtitle: statusLabel(a.status),
      href: `/admin/equip/${a.id}`,
      at: a.updatedAt,
    })),
    ...recentSpeakers.map((s) => ({
      kind: "Speaker submission",
      icon: Mic,
      iconCls: "bg-amber-50 text-amber-700 border-amber-200",
      title: s.organization ? `${s.fullName} · ${s.organization}` : s.fullName,
      subtitle: s.event.title,
      href: s.event.slug === SYMPOSIUM_EVENT_SLUG ? SYMPOSIUM_SPEAKERS : `/admin/events/${s.event.slug}/speakers`,
      at: s.submittedAt as Date,
    })),
    ...recentSocial.map((p) => ({
      kind: "Social post",
      icon: Megaphone,
      iconCls: "bg-violet-50 text-violet-700 border-violet-200",
      title: `${humanise(p.kind)} · ${humanise(p.status)}`,
      subtitle: `sends ${fmtWhen(p.scheduledFor)}`,
      href: SOCIAL,
      at: p.updatedAt,
    })),
    ...recentBookings.map((b) => ({
      kind: "Training Week booking",
      icon: SlidersHorizontal,
      iconCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      title: b.user?.name ?? b.user?.email ?? b.submission?.email ?? "Registrant",
      subtitle: b.workshop.title,
      href: TRAINING_ADMIN,
      at: b.bookedAt,
    })),
    ...recentReminders.map((r) => ({
      kind: "Newsletter reminder",
      icon: Mail,
      iconCls: "bg-rose-50 text-rose-700 border-rose-200",
      title: `${humanise(r.kind)} · ${r.cycle.month.slice(0, 7)}`,
      subtitle: humanise(r.status),
      href: NEWSLETTER_CALENDAR,
      at: r.sentAt as Date,
      cta: "Open",
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);

  const upcoming: Upcoming[] = [
    ...deadlines.map((d) => ({
      at: d.deadlineAt,
      kind: "EQUIP deadline",
      label: `${humanise(d.stream)} · ${d.cycleLabel ?? "cycle"}`,
      href: "/admin/equip/deadlines",
    })),
    ...events.map((e) => ({ at: e.startDate, kind: "Event", label: e.title, href: `/admin/events/${e.slug}` })),
    ...cycles.flatMap((c) => {
      const month = c.month.slice(0, 7);
      // Milestones are calendar days, so compare them as days: one dated
      // today stays listed all day instead of dropping out mid-morning.
      const lastDay = torontoToday(window.to);
      return [
        { ymd: c.approvalDue, label: `${month} issue — approval due` },
        { ymd: c.sendDate, label: `${month} issue — send day` },
      ]
        .filter((m) => m.ymd >= today && m.ymd <= lastDay)
        .map((m) => ({ at: dayAt(m.ymd), label: m.label, kind: "Newsletter", href: NEWSLETTER_CALENDAR }));
    }),
    ...scheduledPosts.map((p) => ({
      at: p.scheduledFor,
      kind: "Social post",
      label: `${humanise(p.kind)} post goes out`,
      href: SOCIAL,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="space-y-6">
      <DSPageHeader
        eyebrow="Workspace"
        title="Waiting on you"
        icon={<Inbox size={22} />}
        description="Every decision the team owes across EQUIP, the events, social, the newsletter and the lists. Each lane is counted by the same rule as its sidebar badge, so a badge means exactly what a lane means."
      />

      <section aria-label="Queues" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Queues</h2>
          {total === 0 ? (
            <p className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 size={13} /> All caught up
            </p>
          ) : (
            <p className="text-xs text-subtle">{plural(total, "item")} waiting</p>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {LANES.map((l) => (
            <QueueLane key={l.key} href={l.href} icon={l.icon} label={l.label} count={counts[l.key] ?? 0} tone={l.tone} />
          ))}
        </div>
      </section>

      {attention.length > 0 && (
        <DSSection title="Needs a look" eyebrow="Signals" icon={<AlertTriangle size={16} />}>
          <ul className="divide-y divide-line">
            {attention.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className="w-8 h-8 rounded-md border bg-amber-50 text-amber-700 border-amber-200 flex items-center justify-center shrink-0">
                  <AlertTriangle size={14} />
                </span>
                <p className="flex-1 min-w-0 text-sm text-fg">{a.text}</p>
                <Link
                  href={a.href}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"
                >
                  Open <ArrowRight size={11} />
                </Link>
              </li>
            ))}
          </ul>
        </DSSection>
      )}

      {rows.length > 0 && <ActivityFeed title="Recent activity" rows={rows} meta={`${rows.length} most recent, newest first`} />}

      <DSSection title="Coming up" eyebrow="Next 30 days" icon={<CalendarClock size={16} />}>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nothing dated in the next 30 days.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((u, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <p className="w-24 shrink-0 text-xs font-semibold tabular-nums text-subtle">{fmtDay(u.at)}</p>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-subtle font-semibold">{u.kind}</p>
                  <p className="text-sm text-fg truncate">{u.label}</p>
                </div>
                <Link
                  href={u.href}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"
                >
                  Open <ArrowRight size={11} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DSSection>
    </div>
  );
}
