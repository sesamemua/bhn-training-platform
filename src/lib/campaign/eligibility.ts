import { findInstitution, type Institution } from "@/lib/equip/institutions";
import type { CampaignProgram } from "./events";

/** End of the currently published national-expansion access window. */
export const LIMITED_ACCESS_END = new Date("2027-02-01T05:00:00.000Z");

export interface CampaignInstitutionResult {
  eligible: boolean;
  reason: "eligible" | "published_window_ended" | "not_listed";
  institution: Institution | null;
  access: "full" | "limited" | "none";
}

/**
 * Institution-only pre-check. Role, field, work authorization and
 * supporting-document rules remain part of the actual application review.
 */
export function checkCampaignInstitution(
  _program: CampaignProgram,
  institutionSlug: string | null | undefined,
  now: Date = new Date(),
): CampaignInstitutionResult {
  const institution = findInstitution(institutionSlug);
  if (!institution) {
    return { eligible: false, reason: "not_listed", institution: null, access: "none" };
  }

  if (institution.tier === "limited" && now.getTime() >= LIMITED_ACCESS_END.getTime()) {
    return {
      eligible: false,
      reason: "published_window_ended",
      institution,
      access: "limited",
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    institution,
    access: institution.tier === "current" ? "full" : "limited",
  };
}
