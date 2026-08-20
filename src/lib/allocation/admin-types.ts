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

export type Audience = "confirmed" | "waitlist" | "pending" | "all";

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
