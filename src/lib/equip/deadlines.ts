/**
 * Helpers for Equip funding-window deadlines.
 *
 * Server-only — depends on prisma + Date math that has no value
 * in the browser. Centralised here so the gating logic stays in
 * one place and the admin / applicant / submit-route call sites
 * stay one-liners.
 *
 * Time zone: the PDFs say deadlines are typically "12:00 PM EST"
 * (Eastern Standard Time, UTC-5 year-round per the PDFs — BHN
 * doesn't observe DST in their printed materials). We store the
 * absolute Date at the UTC moment that corresponds to noon
 * Toronto on the chosen calendar date. The conversion runs
 * client-side in the date+time picker on the admin page; this
 * module just treats `deadlineAt` as a UTC instant.
 */
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { EquipStream } from "@/lib/equip/types";

export type DeadlineStatus = "open" | "closed" | "extended";

export interface DeadlineRow {
  id: string;
  stream: string;
  deadlineAt: Date;
  originalDeadlineAt: Date;
  status: string;
  cycleLabel: string | null;
  note: string | null;
  closedAt: Date | null;
  extendedAt: Date | null;
  createdAt: Date;
}

/** Is the given row effectively accepting submissions right now?
 *  Closed → never. Open / extended → yes if deadlineAt is in the
 *  future (we let admins create future-dated open windows so the
 *  applicant page can show "next deadline" copy without re-opening
 *  every cycle). */
export function isOpenForSubmissions(row: Pick<DeadlineRow, "status" | "deadlineAt">, now: Date = new Date()): boolean {
  if (row.status === "closed") return false;
  return row.deadlineAt.getTime() >= now.getTime();
}

/**
 * The next deadline a new application for this stream would be
 * judged against. Picks the earliest deadlineAt among rows that
 * are still effectively-open. Returns null when no future window
 * exists — the /equip submit endpoint blocks new submissions
 * with a clear "no open cycle" error in that case.
 */
export const nextOpenDeadline = cache(async (stream: EquipStream): Promise<DeadlineRow | null> => {
  const now = new Date();
  const rows = await prisma.equipDeadline.findMany({
    where: {
      stream,
      status: { in: ["open", "extended"] },
      deadlineAt: { gte: now },
    },
    orderBy: { deadlineAt: "asc" },
    take: 1,
  });
  return rows[0] ?? null;
});

/** Every stream's next open deadline in one fetch. Useful for the
 *  /equip landing page. */
export const nextOpenDeadlines = cache(async (): Promise<Record<EquipStream, DeadlineRow | null>> => {
  const now = new Date();
  const rows = await prisma.equipDeadline.findMany({
    where: {
      status: { in: ["open", "extended"] },
      deadlineAt: { gte: now },
    },
    orderBy: { deadlineAt: "asc" },
  });
  const byStream: Record<string, DeadlineRow | null> = {
    venture_connect:       null,
    venture_lift:          null,
    innovation_fellowship: null,
  };
  for (const row of rows) {
    if (byStream[row.stream] == null) byStream[row.stream] = row;
  }
  return byStream as Record<EquipStream, DeadlineRow | null>;
});

/** All deadlines for the admin list / calendar view. Newest
 *  first; both open and closed surfaced (filter client-side). */
export async function listDeadlines(): Promise<DeadlineRow[]> {
  return prisma.equipDeadline.findMany({
    orderBy: { deadlineAt: "desc" },
  });
}

/**
 * Format a UTC Date as a noon-Eastern wall-clock for display.
 * We always emit Toronto wall-clock for human readability — the
 * raw UTC time is irrelevant to applicants who read "May 1 at
 * 12:00 PM ET" not "May 1 at 17:00 UTC".
 */
export function formatDeadlineEastern(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

/** True iff the date is already in the past. Useful for the
 *  admin list view to render closed-by-time rows differently
 *  from manually-closed ones. */
export function isPastDeadline(d: Date | string): boolean {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.getTime() < Date.now();
}
