/**
 * PUBLIC Training Week 2026 feed — no login required.
 *
 * The single source of truth for biohubnet.ca/training-week-2026 (built and
 * maintained with ChatGPT Codex): every bookable session with its day, times,
 * room, seats, and whether registration for it is Open, Full or Closed — with
 * the message the team wrote in Training Admin → Open / closed. Plus whether
 * the registration form as a whole is taking registrations.
 *
 * Titles and times come from the schedule (src/lib/training-week/schedule-2026.ts),
 * status from the trainingWeek.workshopStatus setting. Internal fields
 * (coordinator, venue notes, tentative flags) are NOT exposed.
 *
 * Contract (keep stable — the external page depends on it):
 *   GET → 200 {
 *     updatedAt: ISO,
 *     registration: { state: "open" | "paused" | "closed", message: string | null, url },
 *     workshops: [{ slug, title, subtitle, kind, date: "YYYY-MM-DD", dayLabel, start: "HH:MM",
 *                   end: "HH:MM", startsAt: ISO, endsAt: ISO, venue, partner, facilitator,
 *                   seats, summary, status: "open" | "full" | "closed",
 *                   statusLabel: "Open" | "Full" | "Closed", message: string | null }]
 *   }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DAYS, SESSIONS, displayVenue, torontoToUtc } from "@/lib/training-week/schedule-2026";
import { REGISTRATION_FORM_SLUG_V2 } from "@/lib/allocation/symposium-2026";
import { REGISTRATION_STATE_KEY, parseSwitch, publicNotice } from "@/lib/registration/state";
import { STATE_LABEL, WORKSHOP_STATUS_KEY, messageOf, parseStatusMap, statusOf } from "@/lib/training-week/workshop-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = "https://bhn-training-platform.vercel.app";
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  const [statusRow, stateRow, form] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: WORKSHOP_STATUS_KEY }, select: { value: true, updatedAt: true } }),
    prisma.platformSetting.findUnique({ where: { key: REGISTRATION_STATE_KEY }, select: { value: true } }),
    prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 }, select: { active: true } }),
  ]);
  const map = parseStatusMap(statusRow?.value);
  // The form being active is what lets people register; the switch only says whether a stop is a pause or a close.
  const recorded = parseSwitch(stateRow?.value, "closed").state;
  const state = form?.active ? "open" : recorded === "open" ? "closed" : recorded;
  const notice = publicNotice(state);

  const body = {
    updatedAt: (statusRow?.updatedAt ?? new Date()).toISOString(),
    registration: {
      state,
      message: notice ? `${notice.title}. ${notice.body}` : null,
      url: `${ORIGIN}/apply/${REGISTRATION_FORM_SLUG_V2}`,
    },
    workshops: SESSIONS.map((s) => {
      const e = statusOf(map, s.slug);
      return {
        slug: s.slug,
        title: s.title,
        subtitle: s.subtitle ?? null,
        kind: s.kind,
        date: s.day,
        dayLabel: DAYS.find((d) => d.date === s.day)?.label ?? s.day,
        start: s.start,
        end: s.end,
        startsAt: torontoToUtc(s.day, s.start).toISOString(),
        endsAt: torontoToUtc(s.day, s.end).toISOString(),
        venue: displayVenue(s.venue),
        partner: s.partner,
        facilitator: s.facilitator,
        seats: s.capacity,
        summary: s.summary,
        status: e.state,
        statusLabel: STATE_LABEL[e.state],
        message: messageOf(e) || null,
      };
    }),
  };
  return NextResponse.json(body, {
    headers: {
      ...CORS,
      // A minute at the edge: a status flipped in Training Admin shows on biohubnet.ca within about a minute.
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
