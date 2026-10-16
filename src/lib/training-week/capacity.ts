/**
 * How full a Training Week session is, for the capacity monitor.
 *
 * Occupancy is existing approvals plus the week-wide suggested approvals,
 * not raw demand. Staff, guests, cancellations and withdrawals are excluded.
 *
 * Pure module: no Prisma, no React.
 */
export type CapacityLevel = "open" | "filling" | "full" | "over";

/** From this share of capacity requested, a session is "filling". */
export const FILLING_AT = 0.8;

export interface SeatLike {
  status: string;
  internal?: boolean;
  withdrawn?: boolean;
  suggestion?: "approve" | "waitlist" | null;
}

export interface SessionCapacity {
  records: number;
  decisions: { approved: number; undecided: number; declined: number; waitlisted: number; withdrawn: number };
  internal: number;
  inactive: number;
  /** Live student requests, any status but cancelled. */
  requested: number;
  confirmed: number;
  suggested: number;
  projectedApproved: number;
  projectedWaitlisted: number;
  waitlisted: number;
  capacity: number;
  /** Projected approvals beyond capacity (e.g. existing overbooking). */
  over: number;
  level: CapacityLevel;
}

export function sessionCapacity(capacity: number, seats: SeatLike[]): SessionCapacity {
  const live = seats.filter((s) => s.status !== "cancelled" && !s.internal && !s.withdrawn);
  const requested = live.length;
  const confirmed = live.filter((s) => s.status === "confirmed").length;
  const suggested = live.filter((s) => ["pending", "waitlist"].includes(s.status) && s.suggestion === "approve").length;
  const projectedApproved = confirmed + suggested;
  const cap = Math.max(0, capacity);
  const level: CapacityLevel =
    projectedApproved > cap ? "over"
    : cap > 0 && projectedApproved === cap ? "full"
    : cap > 0 && projectedApproved >= cap * FILLING_AT ? "filling"
    : "open";
  return {
    records: seats.length,
    decisions: {
      approved: seats.filter((s) => s.status === "confirmed" && !s.withdrawn).length,
      undecided: seats.filter((s) => s.status === "pending" && !s.withdrawn).length,
      declined: seats.filter((s) => s.status === "cancelled" && !s.withdrawn).length,
      waitlisted: seats.filter((s) => s.status === "waitlist" && !s.withdrawn).length,
      withdrawn: seats.filter((s) => s.withdrawn).length,
    },
    internal: seats.filter((s) => s.internal && s.status !== "cancelled" && !s.withdrawn).length,
    inactive: seats.filter((s) => s.status === "cancelled" || s.withdrawn).length,
    requested,
    confirmed, suggested, projectedApproved,
    projectedWaitlisted: live.filter((s) => s.suggestion === "waitlist" || s.status === "waitlist" && s.suggestion !== "approve").length,
    waitlisted: live.filter((s) => s.status === "waitlist").length,
    capacity: cap,
    over: Math.max(0, projectedApproved - cap),
    level,
  };
}

export function registrationSummary(c: SessionCapacity): string {
  const d = c.decisions;
  return [
    `Approved: ${d.approved}`, `To be decided: ${d.undecided}`, `Declined: ${d.declined}`,
    ...(d.waitlisted ? [`Waitlisted: ${d.waitlisted}`] : []),
    ...(d.withdrawn ? [`Can't attend: ${d.withdrawn}`] : []), `Total: ${c.records}`,
  ].join(" · ");
}

export interface MonitorSession {
  id: string;
  slug: string;
  title: string;
  start: string;
  cap: SessionCapacity;
  registration?: import("./workshop-status").StatusEntry;
}
