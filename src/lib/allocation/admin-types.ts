/**
 * Shapes shared between the Admin tab's server actions and its UI.
 *
 * They live here rather than in the actions file because a "use server"
 * module may only export async functions — a plain const or a type
 * exported alongside them fails the build, and the failure names the
 * line rather than the rule.
 *
 * The Workshop shape and its seat counts live here for a second reason:
 * the Admin tab is one enormous client component that imports its own
 * server actions, so anything declared beside them drags `server-only`
 * into every module that wants the type — including the calendar, which
 * is otherwise pure drawing.
 */
import { CONFIRM_DAYS_BEFORE } from "@/lib/formbuilder/training-week";

export interface AdminBooking {
  id: string;
  status: string;
  bookedAt: string;
  /** When an admin approved it. Null on rows that never needed it. */
  approvedAt: string | null;
  waitlistPosition: number | null;
  user: { id: string; name: string | null; email: string; organization: string | null; country: string | null } | null;
}

export interface AdminWorkshop {
  id: string; slug: string; title: string; kind: string;
  capacity: number; waitlistCapacity: number;
  requiresApproval: boolean; isActive: boolean;
  startDateTime: string; endDateTime: string;
  locationName: string | null; partnerOrganization: string | null;
  shortDescription: string | null;
  bookings: AdminBooking[];
}

/**
 * The five numbers for one workshop, in the order the organisers read
 * them: approved, confirmed, confirmed by the cut-off, waitlisted, and
 * what the room actually holds.
 *
 * `byCutOff` is confirmed AND approved on or before the cut-off, which
 * is the closest the data supports: the platform records when an ADMIN
 * approved a booking, not when the registrant themselves confirmed. The
 * column says what it measures rather than implying the other thing.
 */
// One number for the deadline the process uses and the deadline the
// reporting measures against — two would drift the first time either
// changed.
export const CUT_OFF_DAYS = CONFIRM_DAYS_BEFORE;

export function countsOf(w: AdminWorkshop) {
  const live = w.bookings.filter((b) => b.status !== "cancelled");
  const cutOff = new Date(w.startDateTime).getTime() - CUT_OFF_DAYS * 86400_000;
  const confirmed = live.filter((b) => b.status === "confirmed");
  return {
    approved: live.filter((b) => b.approvedAt).length,
    confirmed: confirmed.length,
    byCutOff: confirmed.filter((b) => b.approvedAt && new Date(b.approvedAt).getTime() <= cutOff).length,
    waitlisted: live.filter((b) => b.status === "waitlist").length,
    capacity: w.capacity,
  };
}

/** Where the decision model is stored in PlatformSetting. */
export const RULES_KEY = "trainingWeek.allocationRules";

export interface WorkshopInput {
  title: string;
  kind: string;
  startDateTime: string;
  endDateTime: string;
  capacity: number;
  waitlistCapacity: number;
  locationName?: string;
  partnerOrganization?: string;
  shortDescription?: string;
  requiresApproval: boolean;
  isActive: boolean;
}

export const AUDIENCES = ["confirmed", "waitlist", "pending", "all"] as const;
export type Audience = (typeof AUDIENCES)[number];

/**
 * Is this actually one of the four?
 *
 * A server action receives whatever the caller sends, and `status` is a
 * plain String column the Prisma client will happily filter on. Without
 * this, `audience: "cancelled"` writes to exactly the people who
 * withdrew, and `audience: { not: "__none__" }` reaches everybody.
 */
export const isAudience = (v: unknown): v is Audience =>
  typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);

/** A database id, or nothing. Rejects an object pretending to be one. */
export const isId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 60;

export interface EmailPlan {
  recipients: {
    email: string; name: string; status: string; workshop: string;
    /** Filled in so the preview shows the letter people will actually get. */
    sessionDate: string; sessionTime: string; sessionVenue: string;
  }[];
  configured: boolean;
  /**
   * True when this audience spans more than one session.
   *
   * A letter saying "your session is at 11:00" cannot honestly go to a
   * list where that is only true for some of them, so the caller checks
   * this against whether the wording is session-specific.
   */
  manySessions: boolean;
}

/** What the Email tab needs to draw the template editor. */
export interface TemplateBundle {
  templates: import("./email-templates").ResolvedTemplate[];
  /** The travel-and-accommodation form, once somebody has set one. */
  supportFormUrl: string;
}

/** One row of the registrant sheet, as submitted. */
export interface SubmissionRow {
  id: string;
  /** When it arrived — what first-come-first-served is decided on. */
  at: string;
  /** Filed from the admin preview rather than by a registrant. */
  isTest: boolean;
  name: string;
  email: string;
  /** Their answer to question one, verbatim. */
  status: string;
  /** Sessions in the order they ranked them. */
  sessions: string[];
  /** The seats those sessions became, and where each one stands. */
  seats: {
    id: string;
    workshop: string;
    /** 1 is their first choice. */
    rank: number;
    /** pending | confirmed | waitlist | cancelled */
    status: string;
    note: string | null;
    decidedAt: string | null;
  }[];
  /** Everything else, by question label, for the expanded view. */
  answers: Record<string, string>;
}
