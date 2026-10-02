/**
 * The Training Week schedule as the public feed serves it, in one of two
 * versions of the same sessions:
 *
 *   • "website" — what biohubnet.ca draws: the timetable and the
 *     description cards. No lunch bands.
 *   • "registration" — the same, plus each session's meal bands, the way
 *     the registration form's calendar shows them.
 *
 * Everything comes from SESSIONS (facts) and WEB_CONTENT (the website's
 * words); positions come from the same lane packing the registration
 * calendar uses, so the two drawings agree on what sits beside what.
 *
 * Pure: no Prisma. The route adds Open/Full/Closed.
 */
import { packDay } from "@/lib/formbuilder/calendar";
import { DAYS, SESSIONS, SESSION_SLOTS, displayVenue, torontoToUtc } from "@/lib/training-week/schedule-2026";
import { WEB_CONTENT } from "@/lib/training-week/web-content";

export const VERSIONS = ["website", "registration"] as const;
export type Version = (typeof VERSIONS)[number];

const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const longDay = (date: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));

export function webSchedule(version: Version = "website") {
  // Lanes per day, from the registration calendar's own packing.
  const placed = new Map<string, { lane: number }>();
  const dayLanes = new Map<string, number>();
  for (const day of [...new Set(SESSION_SLOTS.map((s) => s.day))]) {
    const packed = packDay(SESSION_SLOTS.filter((s) => s.day === day));
    for (const p of packed) placed.set(p.option, { lane: p.lane });
    dayLanes.set(day, Math.max(1, ...packed.map((p) => p.lane + 1)));
  }
  const from = Math.floor(Math.min(...SESSIONS.map((s) => mins(s.start))) / 60) * 60;
  const to = Math.ceil(Math.max(...SESSIONS.map((s) => mins(s.end))) / 60) * 60;
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  return {
    version,
    timezone: "America/Toronto",
    hours: { from: hh(from), to: hh(to) },
    days: [...dayLanes.keys()].sort().map((date) => ({
      date,
      label: DAYS.find((d) => d.date === date)?.label ?? date,
      longLabel: longDay(date),
      lanes: dayLanes.get(date)!,
    })),
    sessions: SESSIONS.map((s, i) => {
      const web = WEB_CONTENT[s.slug];
      return {
        slug: s.slug,
        anchor: web?.anchor ?? s.slug,
        /** The name the website shows (can be shorter than the form's). */
        webTitle: web?.title ?? s.title,
        host: web ? web.host : s.subtitle ?? null,
        kind: s.kind,
        date: s.day,
        dayLabel: DAYS.find((d) => d.date === s.day)?.label ?? s.day,
        longDate: longDay(s.day),
        start: s.start,
        end: s.end,
        time12: `${clock12(s.start)}–${clock12(s.end)}`,
        startsAt: torontoToUtc(s.day, s.start).toISOString(),
        endsAt: torontoToUtc(s.day, s.end).toISOString(),
        /** Minutes after hours.from, and how long — for placing the block. */
        offsetMinutes: mins(s.start) - from,
        durationMinutes: mins(s.end) - mins(s.start),
        /** 1-based column within its day; the day's lane count is on `days`. */
        lane: (placed.get(SESSION_SLOTS[i].option)?.lane ?? 0) + 1,
        seats: s.capacity,
        venue: displayVenue(s.venue),
        partner: s.partner,
        facilitator: s.facilitator,
        transport: s.transport ?? null,
        summary: s.summary,
        detailsHtml: web?.detailsHtml ?? null,
        ...(version === "registration" ? { breaks: s.breaks ?? [] } : {}),
      };
    }),
  };
}
