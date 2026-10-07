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
import type { ApplicantInfo } from "./applicants";

import type { Highlight } from "./highlights";

export interface AdminBooking {
  id: string;
  status: string;
  bookedAt: string;
  /** When an admin approved it. Null on rows that never needed it. */
  approvedAt: string | null;
  waitlistPosition: number | null;
  user: { id: string; name: string | null; email: string; organization: string | null; country: string | null } | null;
  /** What the decision model knows about the person — from the form and the roster. */
  applicant: ApplicantInfo;
  /** The latest decision has not been emailed to them yet. */
  letterOwed: boolean;
  /** They released the seat themselves ("I can't make it"). */
  withdrawn?: boolean;
  /** BioHubNet's own people (see lib/training-week/internal.ts): in the
   *  room and at lunch, never in a student seat. */
  internal?: boolean;
  /** Made from the Internal list (not registered through the form). */
  internalMade?: boolean;
  /** Admins' highlights on this person, with who and why. */
  highlights?: Highlight[];
  /** Said on the registration: what the Registrants views read. */
  registrant: {
    /** One person: their registration, or their account. */
    personKey: string;
    dietary: string[];
    dietaryOther: string;
    /** "" not answered · "none" said none · otherwise what they wrote. */
    accessibility: string;
    postcode: string;
  };
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

/** Approval confirms attendance; there is no second confirmation or cut-off. */
export function countsOf(w: AdminWorkshop) {
  /*
   * Students only. Capacity is the seats a room offers trainees, so
   * internal people — staff and guests — are counted beside it, never
   * against it: a room of 20 with two staff in it still has 20 seats to
   * give. They are still people at lunch, which is why catering reads
   * the seats directly and sees them.
   */
  const live = w.bookings.filter((b) => b.status !== "cancelled" && !b.internal);
  const confirmed = live.filter((b) => b.status === "confirmed");
  return {
    approved: confirmed.length,
    confirmed: confirmed.length,
    waitlisted: live.filter((b) => b.status === "waitlist").length,
    capacity: w.capacity,
    internal: w.bookings.filter((b) => b.internal && b.status === "confirmed").length,
  };
}

/** Where the decision model is stored in PlatformSetting. */
export const RULES_KEY = "trainingWeek.allocationRules";
/** Where the saved Registrants views are stored (shared by every admin). */
export const REGISTRANT_VIEWS_KEY = "trainingWeek.registrantViews";

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
    /** The registration behind the seat — where their pass comes from. */
    submissionId?: string | null;
    /** The seat itself — where "I can't make it" points. */
    bookingId?: string | null;
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
  /** BioHubNet staff or a listed guest — never in a student seat. */
  internal?: boolean;
  /**
   * Which version of the registration form it came in on.
   *
   * The two ask the same questions in different words, and store
   * different wording for the same answer — "Yes — accepted into ENGAGE
   * or EXPERIENCE" on v1 is "I have been accepted into ENGAGE or
   * EXPERIENCE program" on v2 — so a coordinator reading a status needs
   * to know which vocabulary it is in.
   *
   * "v1", "v2", … — versionLabel of the form's slug. A string rather
   * than a closed union: a later version made with Duplicate pools here
   * too, and must be labelled as itself rather than as v1.
   */
  form: string;
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
    /** The decision has not been emailed yet. */
    letterOwed: boolean;
    /** When they were last emailed about this seat. */
    toldAt: string | null;
    /** They told us they can't make it — when, and why. */
    withdrawnAt?: string | null;
    withdrawReason?: string | null;
  }[];
  /** Everything else, by question label, for the expanded view. */
  answers: Record<string, string>;
  /** Where it was sent from — IP and the area it maps to. Absent before 2 Oct 2026. */
  origin?: { ip: string | null; city: string | null; region: string | null; country: string | null } | null;
}
