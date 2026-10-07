import { emailKey } from "@/lib/eligibility/email-key";
import { rankApplicants, withPreferenceRule, type Rule } from "./model";
import type { ApplicantInfo, Suggestion } from "./applicants";

export interface SuggestionWorkshop {
  id: string;
  title: string;
  capacity: number;
  isActive: boolean;
  startDateTime: string;
  endDateTime: string;
  bookings: {
    id: string;
    status: string;
    internal?: boolean;
    withdrawn?: boolean;
    registrant: { personKey: string };
    applicant: ApplicantInfo;
  }[];
}

export interface SeatSuggestion {
  suggestion: Suggestion;
  reason: string;
}

type Period = Pick<SuggestionWorkshop, "startDateTime" | "endDateTime">;

export function validSessionTime(session: Period): boolean {
  const start = Date.parse(session.startDateTime), end = Date.parse(session.endDateTime);
  return Number.isFinite(start) && Number.isFinite(end) && start < end;
}

/** Half-open intervals: back-to-back sessions are allowed; unknown times fail closed. */
export function sessionsOverlap(a: Period, b: Period): boolean {
  return !validSessionTime(a) || !validSessionTime(b)
    || Date.parse(a.startDateTime) < Date.parse(b.endDateTime) && Date.parse(b.startDateTime) < Date.parse(a.endDateTime);
}

export function seatPersonKey(email: string, fallback: string): string {
  const key = emailKey(email);
  return key ? `email:${key}` : `record:${fallback}`;
}

export interface ReservedSeat {
  id: string;
  personKey: string;
  internal?: boolean;
  workshop: Pick<SuggestionWorkshop, "id" | "title" | "capacity" | "isActive" | "startDateTime" | "endDateTime">;
}

/** Shared by the preview and the transactional approval check. */
export function seatApprovalProblem(seat: ReservedSeat, held: ReservedSeat[]): string | null {
  if (!seat.workshop.isActive) return "Session is inactive.";
  if (!validSessionTime(seat.workshop)) return "Session dates need correction.";
  const others = held.filter((other) => other.id !== seat.id);
  const conflict = others.find((other) => other.personKey === seat.personKey
    && (other.workshop.id === seat.workshop.id || sessionsOverlap(other.workshop, seat.workshop)));
  if (conflict) return `Conflicts with ${conflict.workshop.title}.`;
  if (!seat.internal && others.filter((other) => !other.internal && other.workshop.id === seat.workshop.id).length >= seat.workshop.capacity) {
    return "No seats remaining.";
  }
  return null;
}

/** One plan for the whole week, independent of workshop display / Apply order. */
export function suggestWeekSeats(workshops: SuggestionWorkshop[], rules: Rule[]): Map<string, SeatSuggestion> {
  const result = new Map<string, SeatSuggestion>();
  const held: ReservedSeat[] = [];
  const candidates: (ApplicantInfo & { seat: ReservedSeat })[] = [];
  const policy = withPreferenceRule(rules);
  for (const workshop of workshops) {
    for (const booking of workshop.bookings) {
      const seat: ReservedSeat = {
        id: booking.id, workshop, internal: booking.internal,
        personKey: seatPersonKey(booking.applicant.email, booking.registrant.personKey),
      };
      result.set(booking.id, { suggestion: null, reason: "" });
      if (booking.status === "confirmed") {
        held.push(seat);
        result.set(booking.id, { suggestion: null, reason: "Confirmed seat kept." });
      } else if (!booking.internal && !booking.withdrawn && ["pending", "waitlist"].includes(booking.status)) {
        candidates.push({ ...booking.applicant, id: booking.id, status: booking.status, seat });
      }
    }
  }
  for (const seat of held) {
    const conflict = held.find((other) => other.id !== seat.id && other.personKey === seat.personKey
      && (other.workshop.id === seat.workshop.id || sessionsOverlap(other.workshop, seat.workshop)));
    if (conflict) result.set(seat.id, { suggestion: null, reason: `Existing confirmed conflict with ${conflict.workshop.title}; review required.` });
  }
  const heldCount = (personKey: string) => held.filter((seat) => !seat.internal && seat.personKey === personKey).length;
  let pending = rankApplicants(candidates.map((candidate) => ({ ...candidate, seatsHeld: heldCount(candidate.seat.personKey) })), policy, candidates.length).map((r) => r.applicant);
  const rebalance = policy.some((rule) => rule.isActive && rule.kind === "fewest_seats_held");
  while (pending.length) {
    const candidate = pending.shift()!;
    const problem = seatApprovalProblem(candidate.seat, held);
    result.set(candidate.id, {
      suggestion: problem ? candidate.status === "pending" ? "waitlist" : null : "approve",
      reason: problem ?? (candidate.preference ? `Choice ${candidate.preference}; seat available, no time conflict.` : "Seat available, no time conflict."),
    });
    if (!problem) {
      held.push(candidate.seat);
      if (rebalance) pending = rankApplicants(pending.map((a) => ({ ...a, seatsHeld: heldCount(a.seat.personKey) })), policy, pending.length).map((r) => r.applicant);
    }
  }
  return result;
}
