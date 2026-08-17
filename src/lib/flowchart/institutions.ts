/**
 * The pick-lists behind the affiliation questions.
 *
 * ── ACADEMIC_INSTITUTIONS needs the real roster ─────────────────────
 * BioHubNet's own site advertises "40+ institutions supported Canada
 * wide" but does not publish the names: the national-expansion article
 * has an `#eligible-institutions` anchor pointing at an empty section,
 * and /engage names only the three logos below. Rather than invent 41
 * plausible-looking Canadian universities — which would be wrong in ways
 * nobody would catch until a registrant could not find their own
 * institution — the list starts with only what is actually published.
 *
 * Paste the real roster into ACADEMIC_INSTITUTIONS and nothing else has
 * to change: the field, the "Other" fallback and the reporting all read
 * from this array.
 */

export const OTHER = "Other";

/** Confirmed from biohubnet.ca/engage. Replace with the full CBRF-BRIF roster. */
export const ACADEMIC_INSTITUTIONS: string[] = [
  "University of Toronto",
  "Toronto Metropolitan University",
  "Seneca Polytechnic",
];

/**
 * Hospitals and health networks. Kept separate from universities because
 * a clinician-scientist belongs to both and picking one loses the other.
 */
export const HEALTH_ORGANISATIONS: string[] = [];

/**
 * What kind of company it is. This is the axis that actually matters for
 * BioHubNet's reporting — a seed-stage spin-out and a large pharma have
 * nothing in common except the word "company".
 */
export const COMPANY_TYPES = [
  "Startup or spin-out (pre-seed / seed)",
  "Scale-up (Series A or later)",
  "Small or medium biotech",
  "Large pharmaceutical",
  "CDMO — contract manufacturing",
  "CRO — contract research",
  "Medical device",
  "Diagnostics",
  "Digital health or health IT",
  "Investor or venture fund",
  "Consultancy or professional services",
  OTHER,
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

/** A pick-list plus Other, ready for a <select>. */
export function withOther(list: readonly string[]): string[] {
  return [...list, OTHER];
}

/** True when a list is still waiting for its real contents. */
export function isPlaceholder(list: readonly string[]): boolean {
  return list.length <= 3;
}
