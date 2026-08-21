/**
 * Shapes shared between the Admin tab's server actions and its UI.
 *
 * They live here rather than in the actions file because a "use server"
 * module may only export async functions — a plain const or a type
 * exported alongside them fails the build, and the failure names the
 * line rather than the rule.
 */

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
