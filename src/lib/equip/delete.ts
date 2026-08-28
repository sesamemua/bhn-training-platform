/**
 * Who may delete an EQUIP application, and when.
 *
 * Pure decision logic; the caller does the deleting. Written down
 * separately because "can this be deleted" is asked from three places
 * — the applicant's own page, the public link, and the admin screen —
 * and three copies of a rule about destroying funding records is three
 * chances to get it wrong.
 */

export type Actor = "owner" | "admin";

export interface Deletable {
  status: string;
  approvedAmount: number | null;
}

/** Decided applications are the ones that carry consequences. */
const DECIDED = new Set(["approved", "funded"]);
/** In somebody's queue: gone from it silently is the problem. */
const IN_REVIEW = new Set(["submitted", "under_review", "pre_screen_approved"]);

export interface DeleteVerdict {
  allowed: boolean;
  /** Shown to whoever asked. Empty when allowed. */
  reason: string;
  /**
   * True when going ahead changes what somebody else can be given.
   * The caller must have been told this explicitly — see needsConfirm.
   */
  affectsCap: boolean;
  /** The caller must pass an explicit confirmation to proceed. */
  needsConfirm: boolean;
}

export function canDelete(app: Deletable, actor: Actor, confirmed: boolean): DeleteVerdict {
  const decided = DECIDED.has(app.status);
  const affectsCap = decided && (app.approvedAmount ?? 0) > 0;

  if (actor === "owner") {
    if (app.status === "draft") {
      return { allowed: true, reason: "", affectsCap: false, needsConfirm: false };
    }
    if (IN_REVIEW.has(app.status)) {
      return {
        allowed: false,
        reason:
          "This has been submitted and is with the EQUIP team. Ask them to withdraw it — " +
          "deleting it here would take it out of their queue without telling them.",
        affectsCap: false,
        needsConfirm: false,
      };
    }
    return {
      allowed: false,
      reason: "A decided application is part of the funding record and cannot be deleted here.",
      affectsCap,
      needsConfirm: false,
    };
  }

  /*
   * An admin may delete anything, but not by accident. Removing an
   * approved application does not only lose the record — the $5,000
   * cap is a live sum over surviving rows, so deleting one hands its
   * allowance back to the applicant. That has to be a decision
   * somebody makes on purpose, not a side effect they discover later.
   */
  if (affectsCap && !confirmed) {
    return {
      allowed: false,
      reason:
        `This application has $${(app.approvedAmount ?? 0).toLocaleString()} approved against it. ` +
        "Deleting it returns that amount to the applicant's $5,000 allowance. " +
        "Confirm if that is what you intend.",
      affectsCap: true,
      needsConfirm: true,
    };
  }

  return { allowed: true, reason: "", affectsCap, needsConfirm: false };
}
