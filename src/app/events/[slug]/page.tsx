import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff as checkIsStaff } from "@/lib/auth";
import { AddToCalendar } from "@/components/events/AddToCalendar";
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  Bus,
  ExternalLink,
  Mic,
  Sparkles,
  Building2,
  Hotel,
  ArrowRight,
  CheckCircle2,
  Pencil,
  Ticket,
  Wrench,
  Video,
} from "lucide-react";

/* ─── Metadata ───────────────────────────────────────────────────── */

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: {
      title: true,
      tagline: true,
      description: true,
      coverImageUrl: true,
      status: true,
    },
  });
  if (!event || event.status !== "published") {
    return { title: "Event not found · BHN Events" };
  }
  return {
    title: `${event.title} · BHN Events`,
    description: event.tagline ?? event.description?.slice(0, 160) ?? undefined,
    openGraph: {
      title: event.title,
      description: event.tagline ?? undefined,
      type: "website",
      images: event.coverImageUrl ? [event.coverImageUrl] : [],
    },
  };
}

/* ─── Page ───────────────────────────────────────────────────────── */

export default async function EventLandingPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // One big query — single round-trip for everything on the page.
  // We pull active workshops only (admins can hide a slot without
  // deleting bookings), and we attach session-speaker joins so the
  // agenda can render attached panellists per session.
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    include: {
      workshops: {
        where: { isActive: true },
        orderBy: [{ startDateTime: "asc" }, { displayOrder: "asc" }],
      },
      hosts: {
        orderBy: { displayOrder: "asc" },
        include: { user: { select: { name: true } } },
      },
      symposiumSessions: {
        orderBy: [{ startTime: "asc" }, { displayOrder: "asc" }],
        include: {
          speakers: {
            orderBy: { order: "asc" },
            include: { speaker: { select: { id: true, fullName: true } } },
          },
        },
      },
      // Only what SpeakerCard draws. Bios run to 250 words now, and
      // pulling every column also pulled the speaker's email address
      // into a page that never shows it.
      speakers: {
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          fullName: true,
          title: true,
          organization: true,
          photoUrl: true,
        },
      },
      sponsors: { orderBy: { displayOrder: "asc" } },
    },
  });

  if (!event || event.status !== "published") notFound();

  // ── Session-aware CTA ──
  //
  // The landing page is public, so we can't *require* auth — but we
  // can detect it. When a signed-in visitor reaches this page, the
  // big "Register" button should NOT bounce them through /login (a
  // round-trip they don't need); it should go straight to
  // /events/[slug]/register. And if they've already got a confirmed
  // Registration, send them to their attendee dashboard instead so
  // the page doesn't keep nagging them to register.
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  // Staff get an inline edit bar so they don't have to navigate
  // through /admin/events to find the editor for the page they're
  // already looking at. Public visitors never see the bar.
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const isStaff = role ? checkIsStaff(role) : false;
  const myReg = userId
    ? await prisma.registration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId } },
        select: { registrationStatus: true },
      })
    : null;
  const isConfirmed = myReg?.registrationStatus === "confirmed";

  const ctaHref = !session
    ? `/login?callbackUrl=${encodeURIComponent(`/events/${slug}/register`)}`
    : isConfirmed
      ? `/events/${slug}/me`
      : `/events/${slug}/register`;
  const ctaPrimary = isConfirmed ? "Open my event dashboard" : "Register";
  const ctaFooter = isConfirmed ? "Open my event dashboard" : "Register now";
  const CtaIcon = isConfirmed ? CheckCircle2 : ArrowRight;
  // Capacity is loaded a few lines down (depends on event being
  // available). We compute the final CTA label below where it's
  // actually used so we can override "Register" → "Join the waitlist"
  // when the event is full + waitlist is open.

  // ── derived data ──
  const workshopDays = groupWorkshopsByDay(event.workshops);
  const sponsorsByTier = groupSponsorsByTier(event.sponsors);
  const heroBg = event.coverImageUrl
    ? `linear-gradient(180deg, rgba(15,29,61,0.55) 0%, rgba(15,29,61,0.85) 100%), url(${event.coverImageUrl})`
    : "linear-gradient(135deg, var(--color-brand-900, #0b1b3b), var(--color-brand-700, #2d4cb8) 60%, var(--color-brand-600, #3b6cef))";

  // Detect online events via the convention established in
  // /admin/events/new: online events store the platform name in
  // mainVenueName (default "Online", overridable to e.g. "Zoom
  // Webinar") and the meeting URL in mainVenueMapUrl, leaving the
  // address blank. The hero chip + venue card both gate on this so
  // an online event doesn't say "In person".
  const isOnline =
    event.mainVenueName === "Online" ||
    (!!event.mainVenueMapUrl && !event.mainVenueAddress);

  // Capacity / waitlist state for the public-facing badge. Counted
  // server-side so the public page tells the truth as of THIS
  // pageload; small race window between page render and the user's
  // POST /register is acceptable — the registration API does its
  // own count at submit time and re-applies the waitlist gate.
  const hasCap = event.maxAttendees !== null;
  const activeCount = hasCap
    ? await prisma.registration.count({
        where: {
          eventId: event.id,
          registrationStatus: { in: ["pending", "confirmed"] },
        },
      })
    : 0;
  const spotsLeft = hasCap
    ? Math.max(0, (event.maxAttendees ?? 0) - activeCount)
    : null;
  const isFull = hasCap && spotsLeft === 0;
  const waitlistOpen = isFull && event.waitlistEnabled;

  // Section sequence — gives editorial "01 / 02 / ..." numbering to
  // the eyebrows so the page reads as chapters rather than as a
  // generic landing. Only count sections that actually render.
  const seq: string[] = [];
  if (event.workshops.length > 0) seq.push("workshops");
  if (event.symposiumSessions.length > 0) seq.push("agenda");
  if (event.speakers.length > 0) seq.push("speakers");
  if (event.sponsors.length > 0) seq.push("sponsors");
  function sectionNo(key: string): string | undefined {
    const idx = seq.indexOf(key);
    return idx >= 0 ? String(idx + 1).padStart(2, "0") : undefined;
  }

  // Event-shape detection — drives several conditional decisions
  // below. A "simple session" is an event with no workshops AND no
  // symposium sessions (typical for an online info session, a single
  // talk, an open house). For those events:
  //   - skip the at-a-glance card (its workshop / agenda slots would
  //     read empty and feel like dead scaffolding)
  //   - hide the "See the agenda" button in the hero
  //   - show start TIME alongside date in the hero eyebrow + footer
  //     CTA (time matters more than date for a one-hour session)
  //   - relabel the speakers section as "Hosted by" when there's a
  //     single host
  // Full-shape events (multi-day symposium with workshops + agenda
  // + speakers + sponsors) get the full scaffolding as before.
  const isSimpleSession =
    event.workshops.length === 0 && event.symposiumSessions.length === 0;
  const sameCalendarDay =
    event.startDate.toLocaleDateString("en-CA", { timeZone: TZ }) ===
    event.endDate.toLocaleDateString("en-CA", { timeZone: TZ });
  /** Hero / footer date eyebrow — adds the time range when the event
   *  is a same-day session, since time matters more than just the
   *  date for a short event. */
  const heroDateLine = sameCalendarDay
    ? `${formatDateRange(event.startDate, event.endDate)} · ${formatTime(event.startDate)}–${formatTime(event.endDate)}`
    : formatDateRange(event.startDate, event.endDate);

  return (
    <>
      {/* ───── Admin edit bar ──────────────────────────────────────
          Sticky strip pinned to the top of the event page for staff.
          Surfaces the four most-used edit affordances right where the
          admin is already looking: Edit basics (title / dates / venue /
          status), Registrations (queue + check-in), See it as a learner
          (clears acting-as to validate the real public flow), and the
          full Admin · Events index. Public visitors never see this. */}
      {isStaff && (
        <div className="admin-glow sticky top-0 z-40 border-b border-amber-300 bg-amber-50/95 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1.5 text-amber-900 font-semibold uppercase tracking-[0.16em] text-[10px] mr-1">
              <Wrench size={11} /> Admin
            </span>
            <Link
              href={`/admin/events/${slug}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-amber-900 bg-amber-100 ring-1 ring-inset ring-amber-300 hover:bg-amber-200 transition-colors font-semibold"
            >
              <Pencil size={11} /> Edit basics
            </Link>
            <Link
              href={`/admin/events/${slug}/registrations`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-amber-900 bg-amber-100 ring-1 ring-inset ring-amber-300 hover:bg-amber-200 transition-colors font-semibold"
            >
              <Ticket size={11} /> Registrations
            </Link>
            <Link
              href="/admin/events"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-amber-900 ring-1 ring-inset ring-transparent hover:ring-amber-300 hover:bg-amber-100 transition-colors"
            >
              <ExternalLink size={11} /> All events
            </Link>
            <span className="ml-auto text-[10px] text-amber-800/80">
              Workshops, sessions, speakers, sponsors still seed-managed (see <code className="font-mono">prisma/seed-events.ts</code>)
            </span>
          </div>
        </div>
      )}

      {/* ───── Hero ─────────────────────────────────────────────── */}
      {/* Editorial treatment (Dec '26 redesign per taste-skill audit):
          left-aligned (not the LLM-default centered-over-dark-mesh
          pattern), oversized date as a mono eyebrow, large display
          title with negative leading for confidence, slim hr below the
          tagline acting as a chapter break before the meta row + CTAs.
          The brand-gradient backdrop stays — that's our existing
          identity. The composition inside is what changes. */}
      <section
        className="relative text-white"
        style={{
          background: heroBg,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-[0.28em] text-white/65">
            {heroDateLine}
          </p>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.95] mt-5 max-w-4xl">
            {event.title}
          </h1>
          {event.tagline && (
            <p className="text-base sm:text-xl text-white/85 mt-6 max-w-2xl leading-relaxed font-light">
              {event.tagline}
            </p>
          )}

          {/* Chapter-break rule — editorial pause before the meta + CTAs. */}
          <div aria-hidden className="h-px bg-white/15 max-w-2xl mt-9" />

          {/* Meta — venue + mode + capacity. Flat row, no chip-on-chip
              stacking. Capacity badge appears only when the event has
              a maxAttendees cap and shows spots-left / waitlist /
              full status. */}
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/85">
            {event.mainVenueName && !isOnline && (
              <span className="inline-flex items-center gap-2">
                <MapPin size={14} className="text-white/65" />
                <span className="font-semibold">{event.mainVenueName}</span>
              </span>
            )}
            {isOnline ? (
              <span className="inline-flex items-center gap-2">
                <Video size={14} className="text-white/65" />
                <span className="font-semibold">
                  Online
                  {event.mainVenueName && event.mainVenueName !== "Online" && (
                    <> <span className="text-white/55">·</span> {event.mainVenueName}</>
                  )}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-white/65">
                <Users size={14} />
                <span>In person</span>
              </span>
            )}
            {event.hosts.length > 0 && (
              <span className="inline-flex items-center gap-2">
                <Users size={14} className="text-white/65" />
                <span>
                  Hosted by{" "}
                  <span className="font-semibold">
                    {event.hosts
                      .map((h) => h.user.name)
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>
              </span>
            )}
            {hasCap && (
              <span className="inline-flex items-center gap-2">
                <Ticket size={14} className="text-white/65" />
                {isFull && waitlistOpen ? (
                  <span className="font-semibold inline-flex items-center gap-2">
                    <span>Full</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] font-bold px-2 py-0.5 rounded-full bg-amber-300/20 text-amber-200 ring-1 ring-inset ring-amber-300/40">
                      Waitlist open
                    </span>
                  </span>
                ) : isFull ? (
                  <span className="font-semibold inline-flex items-center gap-2">
                    <span>Sold out</span>
                  </span>
                ) : spotsLeft !== null && spotsLeft <= 10 ? (
                  <span className="font-semibold inline-flex items-center gap-2">
                    <span>{spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] font-bold px-2 py-0.5 rounded-full bg-rose-300/20 text-rose-200 ring-1 ring-inset ring-rose-300/40">
                      Almost full
                    </span>
                  </span>
                ) : (
                  <span className="font-semibold">
                    {activeCount} / {event.maxAttendees} registered
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Primary CTA — relabels to "Join the waitlist" when the
                event is full but waitlist is open. Stays disabled
                ("Event full") when waitlist is closed too. */}
            {isFull && !waitlistOpen && !isConfirmed ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/30 text-white/70 text-sm font-bold cursor-not-allowed shadow-lg"
              >
                Event full
              </button>
            ) : (
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-brand-900 text-sm font-bold hover:bg-brand-50 transition-colors shadow-lg"
              >
                {isConfirmed
                  ? ctaPrimary
                  : isFull && waitlistOpen
                    ? "Join the waitlist"
                    : ctaPrimary}{" "}
                <CtaIcon size={14} />
              </Link>
            )}
            {/* Add-to-calendar dropdown — Google / Outlook / Yahoo
                URL deep-links. .ics file attachment is queued for
                Phase 2 (will become a fourth "Apple / iCal" entry). */}
            <AddToCalendar
              slug={event.slug}
              title={event.title}
              description={event.tagline ?? event.description ?? null}
              location={event.mainVenueName ?? null}
              startISO={event.startDate.toISOString()}
              endISO={event.endDate.toISOString()}
              tone="dark"
            />
            {/* "See the agenda" only renders when an agenda actually
                exists. */}
            {event.symposiumSessions.length > 0 && (
              <a
                href="#agenda"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white ring-1 ring-inset ring-white/40 hover:bg-white/10 transition-colors"
              >
                See the agenda
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ───── At-a-glance ─────────────────────────────────────── */}
      {/* Only renders for full-shape events (any of workshops /
          sessions / speakers / sponsors). For a simple online session
          the stats would either repeat the hero or read "0 on offer"
          / "TBD" — dead scaffolding. Better to omit and let the
          description section breathe directly under the hero. */}
      {!isSimpleSession && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 -mt-8 relative z-10">
          <div className={`bg-card border border-line rounded-2xl surface-shadow p-5 sm:p-6 grid grid-cols-2 gap-4 ${
            event.workshops.length > 0 && event.symposiumSessions.length > 0
              ? "md:grid-cols-4"
              : "md:grid-cols-3"
          }`}>
            <Stat icon={Calendar} label="Dates">
              {formatDateRange(event.startDate, event.endDate)}
            </Stat>
            <Stat icon={isOnline ? Video : MapPin} label={isOnline ? "Format" : "Venue"}>
              {event.mainVenueName ?? (isOnline ? "Online" : "—")}
            </Stat>
            {event.workshops.length > 0 && (
              <Stat icon={Sparkles} label="Workshops &amp; tours">
                {event.workshops.length} on offer
              </Stat>
            )}
            {event.symposiumSessions.length > 0 && (
              <Stat icon={Mic} label="Symposium day">
                {formatDay(event.symposiumSessions[event.symposiumSessions.length - 1].startTime)}
              </Stat>
            )}
          </div>
        </section>
      )}

      {/* ───── About / description ─────────────────────────────── */}
      {event.description && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="text-base sm:text-lg text-fg leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        </section>
      )}

      {/* ───── Training Week — workshops ───────────────────────── */}
      {event.workshops.length > 0 && (
        <section id="workshops" className="bg-elevated">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <SectionHeader
              number={sectionNo("workshops")}
              eyebrow="Training Week"
              title="Workshops, tours, and bootcamps"
              description="Hands-on programming with partner organizations. Each slot has a hard capacity; book early. Attendees can pick up to 2 workshops across the whole Training Week."
            />

            <div className="space-y-10 mt-10">
              {workshopDays.map((day) => (
                <div key={day.dayKey}>
                  <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-subtle mb-4">
                    {day.label}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {day.workshops.map((w) => (
                      <WorkshopCard key={w.id} workshop={w} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───── Symposium Day agenda ────────────────────────────── */}
      {event.symposiumSessions.length > 0 && (
        <section id="agenda">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <SectionHeader
              number={sectionNo("agenda")}
              eyebrow="Symposium Day"
              title="Full-day agenda"
              description="One day at the main venue: keynote, two panels, parallel breakouts, pitch competition, and a networking reception. Registered attendees pick one of the afternoon breakouts in advance."
            />

            <ol className="mt-8 space-y-2">
              {groupSessions(event.symposiumSessions).map((slot) =>
                slot.type === "single" ? (
                  <AgendaRow
                    key={slot.session.id}
                    session={slot.session}
                  />
                ) : (
                  <BreakoutPair
                    key={slot.groupId}
                    sessions={slot.sessions}
                  />
                ),
              )}
            </ol>
          </div>
        </section>
      )}

      {/* ───── Speakers ────────────────────────────────────────── */}
      {event.speakers.length > 0 && (
        <section className="bg-elevated">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <SectionHeader
              number={sectionNo("speakers")}
              eyebrow={event.speakers.length === 1 ? "Hosted by" : "Featured"}
              title={
                event.speakers.length === 1
                  ? "Your host"
                  : "Speakers, panellists, and facilitators"
              }
              description={
                event.speakers.length === 1
                  ? undefined
                  : "Industry leaders, scientists, and BHN trainees sharing real-world experience."
              }
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-10">
              {event.speakers.map((s) => (
                <SpeakerCard key={s.id} speaker={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───── Sponsors / Partners / Funders ───────────────────── */}
      {event.sponsors.length > 0 && (
        <section>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <SectionHeader
              number={sectionNo("sponsors")}
              eyebrow="Made possible by"
              title="Partners &amp; funders"
              description="Delivery partners run the workshops and tours. Funders make the whole programme possible."
            />

            <div className="mt-10 space-y-8">
              {sponsorsByTier.map((group) => (
                <SponsorTierRow key={group.tier} group={group} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───── Venue + accommodation ───────────────────────────── */}
      <section className="bg-elevated">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          {event.mainVenueName && (
            <div className="rounded-2xl bg-card border border-line p-5 sm:p-6 surface-shadow">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                  {isOnline ? <Video size={18} /> : <Building2 size={18} />}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
                    {isOnline ? "Online via" : "Venue"}
                  </p>
                  <p className="text-base font-bold text-fg tracking-tight mt-0.5">
                    {event.mainVenueName}
                  </p>
                </div>
              </div>
              {event.mainVenueAddress && !isOnline && (
                <p className="text-sm text-muted leading-snug mt-3 font-mono">
                  {event.mainVenueAddress}
                </p>
              )}
              {event.mainVenueMapUrl && (
                <a
                  href={event.mainVenueMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 mt-3 hover:underline"
                >
                  {isOnline ? <>Open meeting link <ExternalLink size={11} /></> : <>Open in maps <ExternalLink size={11} /></>}
                </a>
              )}
              {isOnline && !event.mainVenueMapUrl && (
                <p className="text-xs text-muted mt-3">
                  The meeting link will be sent to confirmed registrants closer to the event.
                </p>
              )}
            </div>
          )}

          {event.accommodationInfo && (
            <div className="rounded-2xl bg-card border border-line p-5 sm:p-6 surface-shadow">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Hotel size={18} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
                    {isOnline ? "Logistics" : "Accommodation"}
                  </p>
                  <p className="text-base font-bold text-fg tracking-tight mt-0.5">
                    {isOnline ? "What to know" : "Stay nearby"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-line mt-3">
                {event.accommodationInfo}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ───── Footer CTA ──────────────────────────────────────── */}
      {/* Editorial footer (Dec '26 redesign per taste-skill audit):
          replaced the duplicated heroBg gradient — reusing the same
          backdrop top + bottom read as lazy. Now a dark fg-tone band
          with the event title surfaced again (people scrolled past
          the hero; reminding them what they're registering for makes
          the CTA feel grounded), date in mono eyebrow, and a balanced
          two-column composition on desktop with the CTA on the right
          rather than centered. */}
      <section className="relative bg-fg text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] md:items-end gap-y-8 gap-x-10">
            <div>
              <p className="text-[11px] sm:text-xs font-mono uppercase tracking-[0.28em] text-white/55">
                {heroDateLine}
              </p>
              <p className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.05] mt-3 max-w-xl">
                {event.title}
              </p>
              {event.registrationClosesAt && (
                <p className="text-xs text-white/55 mt-4 inline-flex items-center gap-1.5">
                  <Clock size={11} />
                  Registration closes {formatDay(event.registrationClosesAt)}
                </p>
              )}
            </div>
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-fg text-sm font-bold hover:bg-white/90 transition-colors shadow-lg shrink-0"
            >
              {ctaFooter} <CtaIcon size={14} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Section helpers ────────────────────────────────────────────── */

function SectionHeader({
  eyebrow, title, description, number,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  /** Optional "01" / "02" / ... section number rendered in front of
   *  the eyebrow. Adds editorial chapter-break rhythm to the page. */
  number?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] font-bold text-brand-700 inline-flex items-baseline gap-2">
        {number && (
          <span className="font-mono text-fg-subtle tracking-normal">{number}</span>
        )}
        {number && <span aria-hidden className="text-fg-subtle">·</span>}
        <span>{eyebrow}</span>
      </p>
      <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight mt-2 leading-[1.1]">{title}</h2>
      {description && (
        <p className="text-sm sm:text-base text-muted leading-relaxed mt-3">{description}</p>
      )}
    </div>
  );
}

function Chip({
  icon: Icon, children, dark = false,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <span
      className={
        dark
          ? "inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm"
          : "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200"
      }
    >
      <Icon size={13} />
      {children}
    </span>
  );
}

function Stat({
  icon: Icon, label, children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle">{label}</p>
        <p className="text-sm font-semibold text-fg leading-snug mt-0.5">{children}</p>
      </div>
    </div>
  );
}

/* ─── Workshop card ──────────────────────────────────────────────── */

type WorkshopRow = Awaited<
  ReturnType<typeof prisma.workshop.findFirst>
> extends infer T
  ? T extends null
    ? never
    : T
  : never;

function WorkshopCard({ workshop }: { workshop: WorkshopRow }) {
  const kindLabel: Record<string, string> = {
    workshop: "Workshop",
    tour: "Tour",
    bootcamp: "Bootcamp",
  };
  return (
    <article className="rounded-xl bg-card border border-line p-5 surface-shadow flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
          {kindLabel[workshop.kind] ?? workshop.kind}
        </span>
        {workshop.partnerOrganization && (
          <span className="text-[11px] font-semibold text-muted">
            {workshop.partnerOrganization}
          </span>
        )}
      </div>

      <h3 className="text-base font-bold text-fg tracking-tight leading-tight">
        {workshop.title}
      </h3>

      {workshop.shortDescription && (
        <p className="text-xs text-muted leading-snug">{workshop.shortDescription}</p>
      )}

      <dl className="text-xs text-fg space-y-1.5 mt-auto">
        <Row icon={Clock}>
          {formatTimeRange(workshop.startDateTime, workshop.endDateTime)}
        </Row>
        <Row icon={MapPin}>{workshop.locationName ?? "TBA"}</Row>
        <Row icon={Users}>
          Capacity {workshop.capacity}
        </Row>
        {workshop.requiresTransport && (
          <Row icon={Bus}>
            Bus from {workshop.departureLocation ?? "common pickup"}
          </Row>
        )}
      </dl>

      {workshop.learnMoreUrl && (
        <a
          href={workshop.learnMoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline mt-1"
        >
          Learn more <ExternalLink size={11} />
        </a>
      )}
    </article>
  );
}

function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-fg leading-snug">
      <Icon size={12} className="text-subtle shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

/* ─── Agenda rendering ───────────────────────────────────────────── */

type SessionWithSpeakers = Awaited<
  ReturnType<typeof prisma.symposiumSession.findMany>
>[number] & {
  speakers: {
    role: string;
    order: number;
    speaker: { id: string; fullName: string };
  }[];
};

type AgendaSlot =
  | { type: "single"; session: SessionWithSpeakers }
  | { type: "breakouts"; groupId: string; sessions: SessionWithSpeakers[] };

/**
 * Collapse adjacent breakouts that share a breakoutGroupId into a
 * single "pick one" row. Other sessions pass through as singles.
 */
function groupSessions(sessions: SessionWithSpeakers[]): AgendaSlot[] {
  const slots: AgendaSlot[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    if (s.breakoutGroupId && !seen.has(s.breakoutGroupId)) {
      seen.add(s.breakoutGroupId);
      const group = sessions.filter((x) => x.breakoutGroupId === s.breakoutGroupId);
      slots.push({ type: "breakouts", groupId: s.breakoutGroupId, sessions: group });
    } else if (!s.breakoutGroupId) {
      slots.push({ type: "single", session: s });
    }
  }
  return slots;
}

function AgendaRow({ session }: { session: SessionWithSpeakers }) {
  const isStructural =
    session.kind === "registration" ||
    session.kind === "break" ||
    session.kind === "meal" ||
    session.kind === "networking";
  return (
    <li
      className={
        isStructural
          ? "flex items-center gap-4 px-4 py-3 rounded-lg bg-elevated/40"
          : "flex items-start gap-4 px-4 py-4 rounded-xl bg-card border border-line surface-shadow"
      }
    >
      <div className="w-20 sm:w-28 shrink-0 text-xs font-mono tabular-nums text-subtle pt-0.5">
        {formatTime(session.startTime)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={isStructural ? "text-sm text-muted" : "text-base font-bold text-fg tracking-tight"}>
            {session.title}
          </p>
          {!isStructural && (
            <KindBadge kind={session.kind} />
          )}
        </div>
        {session.description && !isStructural && (
          <p className="text-xs text-muted leading-snug mt-1">{session.description}</p>
        )}
        {session.speakers.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-2">
            {session.speakers.map((s) => (
              <li
                key={s.speaker.id}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-elevated text-fg ring-1 ring-inset ring-line"
              >
                {s.speaker.fullName}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function BreakoutPair({ sessions }: { sessions: SessionWithSpeakers[] }) {
  const startTime = sessions[0]?.startTime;
  return (
    <li className="flex items-stretch gap-4 px-4 py-4 rounded-xl bg-card border-2 border-brand-200 surface-shadow">
      <div className="w-20 sm:w-28 shrink-0 text-xs font-mono tabular-nums text-subtle pt-0.5">
        {startTime && formatTime(startTime)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-700">
            Pick one of these breakouts
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-lg bg-elevated p-3 ring-1 ring-inset ring-line">
              <p className="text-sm font-bold text-fg tracking-tight leading-tight">{s.title}</p>
              {s.description && (
                <p className="text-xs text-muted leading-snug mt-1">{s.description}</p>
              )}
              {s.speakers.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 mt-2">
                  {s.speakers.map((sp) => (
                    <li
                      key={sp.speaker.id}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-card text-fg ring-1 ring-inset ring-line"
                    >
                      {sp.speaker.fullName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const tones: Record<string, string> = {
    keynote: "bg-amber-100 text-amber-800 ring-amber-200",
    panel: "bg-sky-100 text-sky-800 ring-sky-200",
    spotlight: "bg-violet-100 text-violet-800 ring-violet-200",
    breakout: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    pitch_competition: "bg-rose-100 text-rose-800 ring-rose-200",
    opening: "bg-elevated text-fg ring-line",
    presentation: "bg-elevated text-fg ring-line",
    closing: "bg-elevated text-fg ring-line",
  };
  const labels: Record<string, string> = {
    keynote: "Keynote",
    panel: "Panel",
    spotlight: "Spotlight",
    breakout: "Breakout",
    pitch_competition: "Pitch competition",
    opening: "Opening",
    presentation: "Talk",
    closing: "Closing",
    networking: "Networking",
    registration: "Registration",
    break: "Break",
    meal: "Meal",
  };
  const tone = tones[kind] ?? "bg-elevated text-subtle ring-line";
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-1.5 py-0.5 rounded ring-1 ring-inset ${tone}`}
    >
      {labels[kind] ?? kind}
    </span>
  );
}

/* ─── Speaker card ───────────────────────────────────────────────── */

/* Exactly the columns the card draws — see the select on the event query. */
type SpeakerRow = {
  id: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  photoUrl: string | null;
};

function SpeakerCard({ speaker }: { speaker: SpeakerRow }) {
  const initials = speaker.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <article className="rounded-xl bg-card border border-line p-4 surface-shadow flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full overflow-hidden bg-elevated mb-3 flex items-center justify-center">
        {speaker.photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={speaker.photoUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-xl font-bold text-subtle">{initials || "?"}</span>
        )}
      </div>
      <p className="text-sm font-bold text-fg tracking-tight leading-tight">
        {speaker.fullName}
      </p>
      {speaker.title && (
        <p className="text-[11px] text-muted leading-snug mt-1 line-clamp-2">
          {speaker.title}
        </p>
      )}
      {speaker.organization && (
        <p className="text-[11px] font-semibold text-fg leading-tight mt-1.5">
          {speaker.organization}
        </p>
      )}
    </article>
  );
}

/* ─── Sponsor rendering ──────────────────────────────────────────── */

type SponsorRow = Awaited<ReturnType<typeof prisma.sponsor.findMany>>[number];

const TIER_LABELS: Record<string, string> = {
  title: "Title sponsor",
  gold: "Gold sponsors",
  silver: "Silver sponsors",
  bronze: "Bronze sponsors",
  partner: "Delivery partners",
  funder: "Funders",
};
const TIER_ORDER = ["title", "gold", "silver", "bronze", "partner", "funder"] as const;

function groupSponsorsByTier(sponsors: SponsorRow[]): { tier: string; label: string; items: SponsorRow[] }[] {
  const buckets = new Map<string, SponsorRow[]>();
  for (const s of sponsors) {
    const list = buckets.get(s.tier) ?? [];
    list.push(s);
    buckets.set(s.tier, list);
  }
  return TIER_ORDER
    .filter((t) => buckets.has(t))
    .map((t) => ({ tier: t, label: TIER_LABELS[t] ?? t, items: buckets.get(t) ?? [] }));
}

function SponsorTierRow({
  group,
}: {
  group: { tier: string; label: string; items: SponsorRow[] };
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle mb-4">
        {group.label}
      </p>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {group.items.map((s) => (
          <li
            key={s.id}
            className="rounded-xl bg-card border border-line p-4 surface-shadow flex flex-col items-center justify-center text-center min-h-[96px]"
          >
            {s.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={s.logoUrl}
                alt={s.name}
                className="max-h-12 max-w-full object-contain"
                loading="lazy"
              />
            ) : (
              <p className="text-sm font-bold text-fg tracking-tight">{s.name}</p>
            )}
            {s.logoUrl && (
              <p className="text-[11px] text-muted mt-2">{s.name}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Date / time formatting ─────────────────────────────────────── */

const TZ = "America/Toronto";

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: TZ });
  // If same calendar day, just show one date. Otherwise show "Oct 27–30, 2025".
  const startStr = fmt(start);
  const endStr = fmt(end);
  const year = end.toLocaleDateString("en-CA", { year: "numeric", timeZone: TZ });
  if (startStr === endStr) return `${startStr}, ${year}`;
  return `${startStr}–${endStr.replace(/^[A-Za-z]+\s+/, "")}, ${year}`;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });
}

function formatTimeRange(start: Date, end: Date): string {
  const sameDay =
    start.toLocaleDateString("en-CA", { timeZone: TZ }) ===
    end.toLocaleDateString("en-CA", { timeZone: TZ });
  if (sameDay) {
    return `${formatDay(start).replace(/, \d{4}.*/, "")} · ${formatTime(start)}–${formatTime(end)}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
}

/* ─── Workshop grouping ──────────────────────────────────────────── */

function groupWorkshopsByDay(workshops: WorkshopRow[]): {
  dayKey: string;
  label: string;
  workshops: WorkshopRow[];
}[] {
  const buckets = new Map<string, WorkshopRow[]>();
  for (const w of workshops) {
    const dayKey = w.startDateTime.toLocaleDateString("en-CA", { timeZone: TZ });
    const list = buckets.get(dayKey) ?? [];
    list.push(w);
    buckets.set(dayKey, list);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, items]) => ({
      dayKey,
      label: items[0]
        ? items[0].startDateTime.toLocaleDateString("en-CA", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: TZ,
          })
        : dayKey,
      workshops: items,
    }));
}
