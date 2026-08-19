import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft, Calendar, Users, Mic2, Award, ExternalLink, Ticket, ListChecks,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EventBasicsEditor } from "@/components/admin/events/EventBasicsEditor";

/**
 * /admin/events/[slug] — single-event admin detail page.
 *
 * Two surfaces:
 *   • Basics editor — inline-saves via PATCH /api/admin/events/[slug]
 *     for every editable field on BhnEvent (title, dates, venue,
 *     status, registration window, etc.). Workshop / session /
 *     speaker / sponsor CRUD is intentionally NOT here; the seed file
 *     remains source of truth until volume justifies dedicated UI.
 *   • Stats + jump-off — registration count (with checked-in tally),
 *     workshop / session / speaker / sponsor totals, and a link into
 *     the registrations queue (which is also where the check-in
 *     scanner lives in a future chunk).
 */
export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const { slug } = await params;

  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    include: {
      _count: {
        select: {
          workshops: true,
          symposiumSessions: true,
          speakers: true,
          sponsors: true,
          registrations: true,
        },
      },
    },
  });
  if (!event) notFound();

  // Cheap secondary aggregate — count checked-in attendees so the
  // dashboard surfaces day-of progress at a glance.
  const checkedInCount = await prisma.registration.count({
    where: { eventId: event.id, checkedInAt: { not: null } },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link
        href="/admin/events"
        className="text-xs text-muted hover:text-fg inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> All events
      </Link>

      <header>
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
          Admin · Engage · Event
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-fg mt-1 tracking-tight inline-flex items-center gap-2 flex-wrap">
          <Calendar size={22} className="text-brand-600" />
          {event.title}
          <StatusChip status={event.status} />
        </h1>
        <p className="text-xs text-subtle font-mono mt-1">/{event.slug}</p>
      </header>

      {/* Stats strip */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          icon={Users}
          label="Registered"
          value={event._count.registrations}
          sub={`${checkedInCount} checked in`}
        />
        <StatCard icon={Calendar} label="Workshops" value={event._count.workshops} />
        <StatCard icon={ListChecks} label="Sessions" value={event._count.symposiumSessions} />
        <StatCard icon={Mic2} label="Speakers" value={event._count.speakers} />
        <StatCard icon={Award} label="Sponsors" value={event._count.sponsors} />
      </section>

      {/* Jump-offs */}
      <section className="flex flex-wrap gap-3">
        <Link
          href={`/admin/events/${event.slug}/registrations`}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-bold hover:bg-brand-700"
        >
          <Ticket size={14} /> Registrations &amp; check-in
        </Link>
        <Link
          href={`/admin/events/${event.slug}/messages`}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-brand-300"
        >
          Send a message
        </Link>
        <Link
          href={`/admin/events/${event.slug}/questions`}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-brand-300"
        >
          Custom questions
        </Link>
        <Link
          href={`/admin/events/${event.slug}/speakers`}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-brand-300"
        >
          Speakers
        </Link>
        <Link
          href={`/admin/events/${event.slug}/hosts`}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-brand-300"
        >
          Hosts
        </Link>
        <Link
          href={`/admin/events/${event.slug}/tickets`}
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-brand-300"
        >
          Tickets
        </Link>
        {event.status === "published" && (
          <Link
            href={`/events/${event.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-brand-300"
          >
            View public page <ExternalLink size={12} />
          </Link>
        )}
      </section>

      {/* Basics editor */}
      <EventBasicsEditor
        slug={event.slug}
        initial={{
          title: event.title,
          tagline: event.tagline ?? "",
          description: event.description ?? "",
          startDate: toLocalInput(event.startDate),
          endDate: toLocalInput(event.endDate),
          timezone: event.timezone,
          mainVenueName: event.mainVenueName ?? "",
          mainVenueAddress: event.mainVenueAddress ?? "",
          mainVenueMapUrl: event.mainVenueMapUrl ?? "",
          coverImageUrl: event.coverImageUrl ?? "",
          accommodationInfo: event.accommodationInfo ?? "",
          status: event.status as "draft" | "published" | "archived",
          registrationOpensAt: toLocalInput(event.registrationOpensAt),
          registrationClosesAt: toLocalInput(event.registrationClosesAt),
        }}
      />

      {/* Deferred-UI explainer */}
      <section className="rounded-2xl border border-dashed border-line bg-card p-5 text-sm">
        <h2 className="font-bold text-fg mb-2">Workshops, sessions, speakers, sponsors</h2>
        <p className="text-muted leading-relaxed">
          These are managed via{" "}
          <code className="font-mono text-fg bg-elevated px-1 rounded">prisma/seed-events.ts</code>{" "}
          (idempotent — running it twice is harmless). Edit the seed and re-run
          with{" "}
          <code className="font-mono text-fg bg-elevated px-1 rounded">npx tsx prisma/seed-events.ts</code>
          . Dedicated CRUD UIs are deferred until the per-event row count
          justifies them.
        </p>
      </section>
    </div>
  );
}

/** Format a Date for an <input type="datetime-local"> control. Returns
 *  empty string for null/undefined. We deliberately use the browser's
 *  local timezone for the input — that's what datetime-local expects —
 *  and let the server interpret strings as the event's `timezone`
 *  field downstream. */
function toLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  // toISOString gives UTC; we want a "local wall clock" string with no
  // Z suffix so the input control accepts it.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatCard({
  icon: Icon, label, value, sub,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 surface-shadow">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] font-bold text-subtle">
        <Icon size={11} />
        {label}
      </div>
      <p className="text-2xl font-bold text-fg font-mono tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tints: Record<string, string> = {
    draft: "bg-elevated text-subtle ring-line",
    published: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    archived: "bg-slate-100 text-slate-800 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${tints[status] ?? tints.draft}`}
    >
      {status}
    </span>
  );
}
