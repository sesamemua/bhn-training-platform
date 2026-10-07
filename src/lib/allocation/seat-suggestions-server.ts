import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emailKey } from "@/lib/eligibility/email-key";
import { isInternal } from "@/lib/training-week/internal";
import { loadInternalSet } from "@/lib/training-week/internal-server";
import { applicantFor } from "./applicants";
import { parseRules } from "./model";
import { RULES_KEY } from "./admin-types";
import { seatApprovalProblem, seatPersonKey, suggestWeekSeats, type ReservedSeat } from "./seat-suggestions";
import type { Decision } from "./decisions";

const select = {
  id: true, status: true, notifiedStatus: true, rank: true, bookedAt: true, withdrawnAt: true,
  userId: true, submissionId: true,
  user: { select: { name: true, email: true, organization: true, country: true } },
  submission: { select: { data: true, email: true, createdAt: true, form: { select: { slug: true } } } },
  workshop: { select: { id: true, eventId: true, title: true, capacity: true, isActive: true, startDateTime: true, endDateTime: true } },
} satisfies Prisma.WorkshopBookingSelect;
type Booking = Prisma.WorkshopBookingGetPayload<{ select: typeof select }>;

function bookingEmail(booking: Booking): string {
  const data = (booking.submission?.data ?? {}) as Record<string, unknown>;
  return (typeof data.trainee_email === "string" && data.trainee_email.trim()) || booking.submission?.email || booking.user?.email || "";
}

function reservation(booking: Booking, internalKeys: Set<string>): ReservedSeat {
  return {
    id: booking.id,
    personKey: seatPersonKey(bookingEmail(booking), booking.submissionId ?? booking.userId ?? booking.id),
    internal: isInternal([bookingEmail(booking), booking.submission?.email, booking.user?.email], booking.submission?.data as Record<string, unknown> | null, internalKeys),
    workshop: {
      ...booking.workshop,
      startDateTime: booking.workshop.startDateTime.toISOString(),
      endDateTime: booking.workshop.endDateTime.toISOString(),
    },
  };
}

/** Recompute rather than trusting the ids a stale browser calls "approve". */
export async function currentSeatSuggestions(eventId: string) {
  const [workshops, stored, internal, rosterCount] = await Promise.all([
    prisma.workshop.findMany({ where: { eventId }, include: { bookings: { select } } }),
    prisma.platformSetting.findUnique({ where: { key: RULES_KEY } }),
    loadInternalSet(),
    prisma.eligibilityEntry.count(),
  ]);
  const keys = workshops.flatMap((w) => w.bookings.map((b) => emailKey(bookingEmail(b)))).filter((k): k is string => !!k);
  const entries = await prisma.eligibilityEntry.findMany({ where: { emailKey: { in: [...new Set(keys)] } }, select: { emailKey: true, name: true } });
  const roster = new Map(entries.map((entry) => [entry.emailKey, entry]));
  return suggestWeekSeats(workshops.map((w) => ({
    ...w, startDateTime: w.startDateTime.toISOString(), endDateTime: w.endDateTime.toISOString(),
    bookings: w.bookings.map((b) => ({
      id: b.id, status: b.status, internal: reservation(b, internal.keys).internal, withdrawn: !!b.withdrawnAt,
      registrant: { personKey: b.submissionId ?? b.userId ?? b.id },
      applicant: applicantFor({
        bookingId: b.id, status: b.status, preference: b.rank, seatsHeld: 0, bookedAt: b.bookedAt.toISOString(), user: b.user,
        submission: b.submission ? { data: b.submission.data as Record<string, unknown>, email: b.submission.email, createdAt: b.submission.createdAt.toISOString(), formSlug: b.submission.form.slug } : null,
        roster: (email) => rosterCount ? roster.get(emailKey(email) ?? "") ?? null : undefined,
      }),
    })),
  })), parseRules(stored?.value));
}

/** Serializable read/check/write prevents concurrent admins filling the same seat or time. */
export async function writeSeatDecision(bookingId: string, decision: Decision, adminId: string | undefined, note?: string, expectedStatuses?: string[]) {
  const internal = decision === "confirmed" ? await loadInternalSet() : null;
  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.workshopBooking.findUnique({ where: { id: bookingId }, select });
      if (!booking) return { ok: false as const, problem: "That seat no longer exists." };
      if (expectedStatuses && !expectedStatuses.includes(booking.status)) {
        return { ok: false as const, problem: "This seat was already decided elsewhere. Refresh the suggestions." };
      }
      if (decision === "confirmed" && booking.status !== "confirmed") {
        if (booking.withdrawnAt) return { ok: false as const, problem: "This person withdrew from the session." };
        const confirmed = await tx.workshopBooking.findMany({ where: { workshop: { eventId: booking.workshop.eventId }, status: "confirmed" }, select });
        const problem = seatApprovalProblem(reservation(booking, internal!.keys), confirmed.map((b) => reservation(b, internal!.keys)));
        if (problem) return { ok: false as const, problem };
      }
      await tx.workshopBooking.update({ where: { id: bookingId }, data: {
        status: decision,
        decisionNote: note?.trim() ? note.trim().slice(0, 500) : null,
        approvedAt: decision === "pending" ? null : new Date(),
        approvedById: decision === "pending" ? null : adminId ?? null,
      } });
      return { ok: true as const, booking };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return { ok: false as const, problem: "Another coordinator changed seats at the same time. Refresh and try again." };
    }
    throw error;
  }
}
