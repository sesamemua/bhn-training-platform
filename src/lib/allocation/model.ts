/**
 * The decision model: who gets a seat when a workshop is oversubscribed.
 *
 * An ordered list of rules. The first rule that can tell two applicants
 * apart decides between them; equal on that rule, the next rule is
 * asked, and so on. The last rule is always a tiebreak that cannot tie —
 * first come, first served — so the order is total and running it twice
 * on the same data gives the same answer twice. An allocation nobody can
 * reproduce is an allocation nobody can defend.
 *
 * Rules are DATA, not code: they are edited in the admin tab, stored as
 * JSON, and read here. Adding a rule kind means adding a comparator
 * below; reordering, disabling or removing rules needs no deploy, which
 * is the point — "out-of-town first" is a policy, and policies change
 * between years without the software changing.
 *
 * Pure module: no React, no Prisma, no I/O.
 */

export type RuleKind =
  | "out_of_town"
  | "current_trainee"
  | "first_come"
  | "under_represented_org"
  | "fewest_seats_held";

export interface Rule {
  id: string;
  kind: RuleKind;
  /** What the organisers call it. Shown in the ranked-list explanation. */
  label: string;
  /** Off keeps the rule in the list without letting it decide anything. */
  isActive: boolean;
  /** Rule-specific knob, e.g. how far away counts as out of town. */
  config?: { minKm?: number; orgTypes?: string[] };
}

/** What a rule needs to know about one applicant. */
export interface Applicant {
  id: string;
  name: string;
  /** Distance from the venue in km, when known. */
  distanceKm?: number | null;
  isOutOfTown?: boolean;
  isCurrentTrainee?: boolean;
  organizationType?: string | null;
  /** When they applied. The tiebreak of last resort. */
  appliedAt: string | Date;
  /** Seats this person already holds across the week. */
  seatsHeld?: number;
}

export interface RuleKindInfo {
  label: string;
  /** What it does, in the words an organiser would use. */
  blurb: string;
  /** Why you might not want it — every rule costs someone a seat. */
  caution: string;
  configurable: boolean;
}

export const RULE_KINDS: Record<RuleKind, RuleKindInfo> = {
  out_of_town: {
    label: "Out-of-town applicants first",
    blurb:
      "Someone travelling in is ranked above someone local, because a local can more easily come to the next one.",
    caution:
      "Needs a travel origin on the registration. Anyone who left it blank counts as local.",
    configurable: true,
  },
  current_trainee: {
    label: "Confirmed trainees first",
    blurb:
      "Anyone matched against the trainee roster is ranked above anyone who is not. Training Week is for HQP.",
    caution: "Ranks unconfirmed trainees below people who never claimed to be one.",
    configurable: false,
  },
  under_represented_org: {
    label: "Under-represented organisations first",
    blurb:
      "Favours applicants from the organisation types you name, to keep one institution from filling a room.",
    caution: "Needs the list kept current, or it quietly favours the wrong people.",
    configurable: true,
  },
  fewest_seats_held: {
    label: "Fewest seats already held",
    blurb:
      "Someone with no seat yet outranks someone already holding two, so the week spreads across more people.",
    caution: "Works against anyone deliberately building a full week for themselves.",
    configurable: false,
  },
  first_come: {
    label: "First come, first served",
    blurb:
      "Earlier application wins. This can never tie, which is what makes the whole order reproducible.",
    caution: "Rewards whoever was at a keyboard when registration opened.",
    configurable: false,
  },
};

/**
 * The policy as it stands: out-of-town first, then first come.
 *
 * Shipped as the starting point rather than as the only option — the
 * admin tab edits this, and what is stored wins.
 */
export const DEFAULT_RULES: Rule[] = [
  {
    id: "r-out-of-town",
    kind: "out_of_town",
    label: "Out-of-town applicants first",
    isActive: true,
    config: { minKm: 50 },
  },
  {
    id: "r-first-come",
    kind: "first_come",
    label: "First come, first served",
    isActive: true,
  },
];

const time = (v: string | Date) => (v instanceof Date ? v.getTime() : Date.parse(v));

const isOutOfTown = (a: Applicant, rule: Rule) => {
  if (typeof a.isOutOfTown === "boolean") return a.isOutOfTown;
  const min = rule.config?.minKm ?? 50;
  return typeof a.distanceKm === "number" ? a.distanceKm >= min : false;
};

/**
 * Compare two applicants under one rule.
 *
 * Negative means `a` outranks `b`. Zero means the rule cannot tell them
 * apart and the next rule should be asked.
 */
function compareBy(rule: Rule, a: Applicant, b: Applicant): number {
  switch (rule.kind) {
    case "out_of_town":
      return Number(isOutOfTown(b, rule)) - Number(isOutOfTown(a, rule));
    case "current_trainee":
      return Number(!!b.isCurrentTrainee) - Number(!!a.isCurrentTrainee);
    case "under_represented_org": {
      const wanted = rule.config?.orgTypes ?? [];
      const rank = (x: Applicant) => (wanted.includes(x.organizationType ?? "") ? 1 : 0);
      return rank(b) - rank(a);
    }
    case "fewest_seats_held":
      return (a.seatsHeld ?? 0) - (b.seatsHeld ?? 0);
    case "first_come":
      return time(a.appliedAt) - time(b.appliedAt);
    default:
      return 0;
  }
}

export interface Ranked {
  applicant: Applicant;
  position: number;
  /** Inside capacity, or over it. */
  outcome: "seat" | "waitlist";
  /**
   * The rule that put this person above the one below them — the answer
   * to "why did they get in and I did not", which is the only question
   * anybody asks about an allocation.
   */
  decidedBy: string | null;
}

/**
 * Rank applicants under the rules, and say what decided each placement.
 *
 * `capacity` only labels the outcome; everyone is ranked either way, so
 * the waitlist is in the order it would be promoted.
 */
export function rankApplicants(
  applicants: Applicant[],
  rules: Rule[],
  capacity: number,
): Ranked[] {
  const active = rules.filter((r) => r.isActive);

  const sorted = [...applicants].sort((a, b) => {
    for (const rule of active) {
      const d = compareBy(rule, a, b);
      if (d !== 0) return d;
    }
    // Nothing separated them. Fall back to the id so the order is stable
    // rather than dependent on the sort implementation.
    return a.id.localeCompare(b.id);
  });

  return sorted.map((applicant, i) => {
    const next = sorted[i + 1];
    let decidedBy: string | null = null;
    if (next) {
      const rule = active.find((r) => compareBy(r, applicant, next) !== 0);
      decidedBy = rule ? rule.label : null;
    }
    return {
      applicant,
      position: i + 1,
      outcome: i < capacity ? "seat" : "waitlist",
      decidedBy,
    };
  });
}

/** Read rules out of storage, falling back to the shipped policy. */
export function parseRules(raw: string | null | undefined): Rule[] {
  if (!raw) return DEFAULT_RULES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_RULES;
    const clean = parsed.filter(
      (r): r is Rule =>
        !!r && typeof r.id === "string" && typeof r.label === "string" && r.kind in RULE_KINDS,
    );
    return clean.length ? clean : DEFAULT_RULES;
  } catch {
    // A corrupt blob must not take the allocation offline; the shipped
    // policy is a defensible answer, an exception is not.
    return DEFAULT_RULES;
  }
}

/**
 * Is this list safe to allocate with?
 *
 * The one thing that actually matters: without a rule that can never
 * tie, two applicants can end up in an order decided by nothing, and
 * the result stops being explainable.
 */
export function validateRules(rules: Rule[]): { ok: boolean; problem?: string } {
  const active = rules.filter((r) => r.isActive);
  if (active.length === 0) return { ok: false, problem: "Every rule is switched off." };
  if (!active.some((r) => r.kind === "first_come")) {
    return {
      ok: false,
      problem:
        "No final tiebreak. Add “First come, first served” at the bottom, or two applicants alike on every rule are ordered by nothing you can explain.",
    };
  }
  if (active[active.length - 1].kind !== "first_come") {
    return {
      ok: false,
      problem: "“First come, first served” should be last — rules below it can never be reached.",
    };
  }
  return { ok: true };
}
