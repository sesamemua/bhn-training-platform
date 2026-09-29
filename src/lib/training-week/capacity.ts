/**
 * How full a Training Week session is, for the capacity monitor.
 *
 * The seats table counts approved and confirmed seats, which stay at zero
 * until anybody is approved — so it cannot show a room with 22 requests
 * for 20 seats. This reads demand: every live student request, pending or
 * not, against the seats the room offers students. Internal people (staff,
 * guests) never count against it, the same rule as countsOf.
 *
 * Pure module: no Prisma, no React.
 */
export type CapacityLevel = "open" | "filling" | "full" | "over";

/** From this share of capacity requested, a session is "filling". */
export const FILLING_AT = 0.8;

export interface SeatLike {
  status: string;
  internal?: boolean;
}

export interface SessionCapacity {
  /** Live student requests, any status but cancelled. */
  requested: number;
  confirmed: number;
  waitlisted: number;
  capacity: number;
  /** Requests beyond capacity. */
  over: number;
  level: CapacityLevel;
}

export function sessionCapacity(capacity: number, seats: SeatLike[]): SessionCapacity {
  const live = seats.filter((s) => s.status !== "cancelled" && !s.internal);
  const requested = live.length;
  const cap = Math.max(0, capacity);
  const level: CapacityLevel =
    requested > cap ? "over"
    : cap > 0 && requested === cap ? "full"
    : cap > 0 && requested >= cap * FILLING_AT ? "filling"
    : "open";
  return {
    requested,
    confirmed: live.filter((s) => s.status === "confirmed").length,
    waitlisted: live.filter((s) => s.status === "waitlist").length,
    capacity: cap,
    over: Math.max(0, requested - cap),
    level,
  };
}

export interface MonitorSession {
  id: string;
  slug: string;
  title: string;
  start: string;
  cap: SessionCapacity;
}
