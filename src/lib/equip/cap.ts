/**
 * The two VentureConnect limits, and the money trail behind them.
 *
 * A company may hold at most $5,000 across at most 3 applications. Both
 * live here rather than at the call site, because there were once two
 * copies of the dollar query and both carried the same bug — a rule
 * about money that exists twice is a rule that will be enforced two
 * different ways the first time one copy is edited.
 *
 * ────────────────────────────────────────────────────────────────────
 * TWO THINGS THIS DOES NOT DECIDE, AND SOMEBODY SHOULD
 *
 * 1. WHO the cap belongs to. The applicant-facing wording is "per
 *    company" (see apply/venture-connect and ConnectForm). What is
 *    enforced below is per PERSON — by account, or by the address a
 *    public applicant used. Two founders of the same company therefore
 *    hold $10,000 and 6 slots between them, which is not what anyone
 *    was promised. Fixing it needs a company identity to group on, and
 *    the form does not collect one reliably. Flagged, not guessed at.
 *
 * 2. WHETHER the cap ever resets. There is no date filter here, so it
 *    is a lifetime cap: a company funded in 2024 carries that against
 *    2026. If it is meant to be per fiscal year, add the window to
 *    `priorWhere` — one clause, and every other figure follows.
 * ────────────────────────────────────────────────────────────────────
 */
import type { Prisma } from "@prisma/client";

/** Most a single applicant may hold across all VentureConnect awards. */
export const VC_DOLLAR_CAP = 5_000;

/** Most VentureConnect applications a single applicant may have funded. */
export const VC_APPLICATION_CAP = 3;

/**
 * Statuses that consume a slot and a share of the dollar cap.
 *
 * Rejected and withdrawn applications do NOT count. A slot is a claim
 * on money; a rejection is the absence of one, and burning a slot for
 * an application that was turned down would punish applying.
 */
export const CAP_CONSUMING_STATUSES = ["approved", "funded"] as const;

/** An application, as far as the caps are concerned. */
export interface CapSubject {
  id: string;
  userId: string | null;
  applicantEmail: string | null;
  stream: string;
}

/**
 * The filter for "this applicant's OTHER VentureConnect applications
 * that count against them".
 *
 * An account holder is identified by userId. A public applicant has no
 * account, and `userId: null` alone would match every OTHER public
 * application — everybody's, not theirs — so their own awards are found
 * by the address they applied with. Getting that wrong does not fail
 * loudly: it silently refuses somebody because strangers were funded.
 */
export function priorApprovalsWhere(app: CapSubject): Prisma.EquipApplicationWhereInput {
  const base: Prisma.EquipApplicationWhereInput = {
    stream: "venture_connect",
    id: { not: app.id },
    status: { in: [...CAP_CONSUMING_STATUSES] },
  };

  if (app.userId) return { ...base, userId: app.userId };

  if (app.applicantEmail) {
    return {
      ...base,
      userId: null,
      applicantEmail: { equals: app.applicantEmail, mode: "insensitive" },
    };
  }

  /*
   * No account and no address. Nothing can be attributed to this person,
   * and attributing EVERYTHING would be far worse — so match no rows.
   *
   * This used to be written as a `{ id: "__none__" }` clause spread into
   * an object that then set `id: { not: app.id }` after it, which
   * silently overwrote the guard. The result was the opposite of the
   * intent: every approved VentureConnect application in the system
   * counted against one anonymous applicant, and they were refused
   * because strangers had been funded. Spread order ate the rule.
   *
   * Written as an impossible AND so no later key can clobber it.
   */
  return { AND: [base, { id: app.id }, { id: { not: app.id } }] };
}

/** One earlier award, as the ledger shows it. */
export interface PriorAward {
  id: string;
  status: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  actualAmount: number | null;
  decidedAt: Date | null;
}

export interface CapState {
  dollarCap: number;
  applicationCap: number;
  /** Sum of approvedAmount on the awards that count. */
  approvedToDate: number;
  /** Sum of actualAmount where it has been recorded. */
  actualToDate: number;
  /** Awards that are reconciled — actualAmount is not null. */
  reconciledCount: number;
  slotsUsed: number;
  slotsLeft: number;
  dollarsLeft: number;
  /** True when a further award is impossible on either limit. */
  atDollarCap: boolean;
  atApplicationCap: boolean;
  prior: PriorAward[];
}

export function capStateFrom(prior: PriorAward[]): CapState {
  const approvedToDate = round2(prior.reduce((n, p) => n + (p.approvedAmount ?? 0), 0));
  const reconciled = prior.filter((p) => p.actualAmount != null);
  const actualToDate = round2(reconciled.reduce((n, p) => n + (p.actualAmount ?? 0), 0));
  const slotsUsed = prior.length;

  return {
    dollarCap: VC_DOLLAR_CAP,
    applicationCap: VC_APPLICATION_CAP,
    approvedToDate,
    actualToDate,
    reconciledCount: reconciled.length,
    slotsUsed,
    slotsLeft: Math.max(0, VC_APPLICATION_CAP - slotsUsed),
    /*
     * Headroom is measured against APPROVED, not actual.
     *
     * If a company is approved $2,000 and spends $1,200, this still
     * treats $2,000 as committed. Releasing the $800 would be defensible
     * — arguably generous and correct — but it is a policy decision
     * nobody has made, and the safe direction for a cap is the one that
     * cannot over-award. The variance report makes the $800 visible so
     * somebody can decide on purpose.
     */
    dollarsLeft: Math.max(0, VC_DOLLAR_CAP - approvedToDate),
    atDollarCap: approvedToDate >= VC_DOLLAR_CAP,
    atApplicationCap: slotsUsed >= VC_APPLICATION_CAP,
    prior,
  };
}

/** Why an approval cannot go through, or null when it can. */
export type CapBlock =
  | { reason: "slots"; message: string }
  | { reason: "dollars"; message: string; remaining: number };

/** What approving `amount` would do to both caps. */
export function checkApproval(state: CapState, amount: number): CapBlock | null {
  // Slots first. A applicant at 3 awards cannot be approved for any
  // amount, so reporting the dollar headroom to them would be a
  // misleading near-miss — "$1,400 remains" when nothing remains.
  if (state.atApplicationCap) {
    return {
      reason: "slots",
      message:
        `This applicant already has ${state.slotsUsed} funded VentureConnect ` +
        `applications, which is the limit of ${state.applicationCap}. ` +
        `Approving a fourth needs the limit changed, not overridden here.`,
    };
  }
  if (amount > state.dollarsLeft) {
    return {
      reason: "dollars",
      remaining: state.dollarsLeft,
      message:
        `Approving $${amount.toLocaleString()} would exceed the $${state.dollarCap.toLocaleString()} ` +
        `per-applicant cap. $${state.approvedToDate.toLocaleString()} is already approved across ` +
        `${state.slotsUsed} application${state.slotsUsed === 1 ? "" : "s"}, so ` +
        `$${state.dollarsLeft.toLocaleString()} remains.`,
    };
  }
  return null;
}

// ── Variance ───────────────────────────────────────────────────────────
//
// Three numbers per application, and the two gaps between them mean
// different things:
//
//   requested → approved   what the committee trimmed. A review decision.
//   approved  → actual     what came back unspent. An outcome.
//
// Reporting only one total loses that distinction, which is why they are
// separate fields rather than one "variance".

export interface Variance {
  requested: number | null;
  approved: number | null;
  actual: number | null;
  /** approved − requested. Negative = trimmed at review. */
  reviewDelta: number | null;
  /** actual − approved. Negative = came in under. */
  spendDelta: number | null;
  /** actual / approved, when both are known and approved is non-zero. */
  utilisation: number | null;
  reconciled: boolean;
}

export function varianceOf(a: {
  requestedAmount: number | null;
  approvedAmount: number | null;
  actualAmount: number | null;
}): Variance {
  const { requestedAmount: requested, approvedAmount: approved, actualAmount: actual } = a;
  return {
    requested, approved, actual,
    reviewDelta: requested != null && approved != null ? round2(approved - requested) : null,
    spendDelta: approved != null && actual != null ? round2(actual - approved) : null,
    utilisation:
      approved != null && actual != null && approved !== 0
        ? Math.round((actual / approved) * 1000) / 1000
        : null,
    reconciled: actual != null,
  };
}

/** Roll several applications up into one applicant-level variance. */
export function totalVariance(apps: {
  requestedAmount: number | null;
  approvedAmount: number | null;
  actualAmount: number | null;
}[]): Variance {
  const sum = (pick: (x: (typeof apps)[number]) => number | null) => {
    const vals = apps.map(pick).filter((v): v is number => v != null);
    return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
  };
  // Only reconciled rows contribute to the actual total, and only their
  // approved figures go into the comparison — otherwise an unreconciled
  // application drags the spend delta down as if it had been returned.
  const reconciled = apps.filter((a) => a.actualAmount != null);
  const requested = sum((a) => a.requestedAmount);
  const approved = sum((a) => a.approvedAmount);
  const actual = reconciled.length ? round2(reconciled.reduce((n, a) => n + (a.actualAmount ?? 0), 0)) : null;
  const approvedReconciled = reconciled.length
    ? round2(reconciled.reduce((n, a) => n + (a.approvedAmount ?? 0), 0))
    : null;

  return {
    requested, approved, actual,
    reviewDelta: requested != null && approved != null ? round2(approved - requested) : null,
    spendDelta: actual != null && approvedReconciled != null ? round2(actual - approvedReconciled) : null,
    utilisation:
      actual != null && approvedReconciled != null && approvedReconciled !== 0
        ? Math.round((actual / approvedReconciled) * 1000) / 1000
        : null,
    reconciled: reconciled.length === apps.length && apps.length > 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Kept for the older call shape. */
export function capVerdict(cap: number, previouslyApproved: number, amount: number) {
  const remaining = Math.max(0, cap - previouslyApproved);
  return { cap, previouslyApproved, remaining, wouldExceed: amount > remaining };
}
