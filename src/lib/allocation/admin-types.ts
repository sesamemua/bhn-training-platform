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
  recipients: { email: string; name: string; status: string; workshop: string }[];
  configured: boolean;
}
