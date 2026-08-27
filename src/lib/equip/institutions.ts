/**
 * BHN partner institutions, and which EQUIP stream each can apply to.
 *
 * SOURCE OF TRUTH (verified 2026-08-27):
 *   https://biohubnet.ca/wp-content/uploads/biohubnet-shared/biohubnet-institutions.js
 *   scriptVersion "20260710x-shared-institutions"
 *
 * biohubnet.ca/equip renders that file into a shadow-DOM custom element
 * (<biohubnet-institutions>), which is why the roster appears nowhere in
 * the page's HTML and why `document.body.innerText` cannot see it either
 * — innerText does not cross a shadow boundary. To re-sync, fetch that
 * one URL and diff; do not scrape the page.
 *
 * TWO ACCESS TIERS, and the distinction is the whole point:
 *
 *   "current"  14 institutions — VentureConnect AND VentureLift.
 *              Funded through March 2028. All are in Ontario.
 *   "limited"  27 institutions — VentureConnect ONLY, until Jan 2027.
 *
 * Total 41. Published region counts self-validate: British Columbia 4,
 * Prairies 8, Ontario 20, Quebec 7, Atlantic Canada 2.
 *
 * ONTARIO IS NOT THE SAME AS THE 14. Ontario has TWENTY partner
 * institutions; six of them are "limited" — University of Ottawa,
 * McMaster, The Ottawa Hospital, Baycrest, Michael Garron and CHEO.
 * Deriving the VentureLift set by filtering on region would wrongly
 * grant those six a $25,000 stream they are not eligible for. Filter on
 * `tier`, never on `region`.
 *
 * This file previously held only the 14 and used them for BOTH streams,
 * so VentureConnect applicants from the other 27 institutions could not
 * find themselves in the list at all.
 *
 * The slug is stored in `EquipApplication.institution` and on the user
 * record, so the fourteen original slugs are preserved exactly. "Other"
 * is appended by the picker UI; picking it captures free text in
 * `EquipApplication.institutionOther`.
 *
 * `region` is BioHubNet's own published grouping, not a province —
 * "Prairies" and "Atlantic Canada" are regions. The site does not
 * publish a province per institution, so none is inferred here.
 */

/** Which EQUIP streams an institution can apply to. */
export type InstitutionTier = "current" | "limited";

/** Published region grouping from biohubnet.ca. */
export type InstitutionRegion =
  | "British Columbia"
  | "Prairies"
  | "Ontario"
  | "Quebec"
  | "Atlantic Canada";

export interface Institution {
  slug: string;
  name: string;
  /** Short token used in human-readable admin filters. */
  shortName?: string;
  region: InstitutionRegion;
  tier: InstitutionTier;
}

export const INSTITUTIONS: Institution[] = [
  // ── British Columbia (4) ──
  { slug: "university-of-british-columbia", name: "University of British Columbia", shortName: "UBC", region: "British Columbia", tier: "limited" },
  { slug: "british-columbia-institute-of-technology", name: "British Columbia Institute of Technology", shortName: "BCIT", region: "British Columbia", tier: "limited" },
  { slug: "simon-fraser-university", name: "Simon Fraser University", shortName: "SFU", region: "British Columbia", tier: "limited" },
  { slug: "university-of-victoria", name: "University of Victoria", shortName: "UVic", region: "British Columbia", tier: "limited" },

  // ── Prairies (8) ──
  { slug: "vaccine-and-infectious-disease-organization", name: "Vaccine and Infectious Disease Organization (VIDO)", shortName: "VIDO", region: "Prairies", tier: "limited" },
  { slug: "university-of-saskatchewan", name: "University of Saskatchewan", shortName: "USask", region: "Prairies", tier: "limited" },
  { slug: "university-of-alberta", name: "University of Alberta", shortName: "UAlberta", region: "Prairies", tier: "limited" },
  { slug: "university-of-calgary", name: "University of Calgary", shortName: "UCalgary", region: "Prairies", tier: "limited" },
  { slug: "university-of-manitoba", name: "University of Manitoba", shortName: "UManitoba", region: "Prairies", tier: "limited" },
  { slug: "concordia-university-of-edmonton", name: "Concordia University of Edmonton", shortName: "Concordia Edmonton", region: "Prairies", tier: "limited" },
  { slug: "university-of-lethbridge", name: "University of Lethbridge", shortName: "ULethbridge", region: "Prairies", tier: "limited" },
  { slug: "university-of-regina", name: "University of Regina", shortName: "URegina", region: "Prairies", tier: "limited" },

  // ── Ontario (20) ──
  { slug: "sickkids", name: "Hospital for Sick Children", shortName: "SickKids", region: "Ontario", tier: "current" },
  { slug: "queens", name: "Queen's University", shortName: "Queen's", region: "Ontario", tier: "current" },
  { slug: "seneca", name: "Seneca Polytechnic", shortName: "Seneca", region: "Ontario", tier: "current" },
  { slug: "sinai", name: "Sinai Health", shortName: "Sinai", region: "Ontario", tier: "current" },
  { slug: "sunnybrook", name: "Sunnybrook Research Institute", shortName: "Sunnybrook", region: "Ontario", tier: "current" },
  { slug: "tmu", name: "Toronto Metropolitan University", shortName: "TMU", region: "Ontario", tier: "current" },
  { slug: "unity", name: "Unity Health Toronto", shortName: "Unity Health", region: "Ontario", tier: "current" },
  { slug: "uhn", name: "University Health Network", shortName: "UHN", region: "Ontario", tier: "current" },
  { slug: "guelph", name: "University of Guelph", shortName: "Guelph", region: "Ontario", tier: "current" },
  { slug: "u-of-t", name: "University of Toronto", shortName: "U of T", region: "Ontario", tier: "current" },
  { slug: "waterloo", name: "University of Waterloo", shortName: "UW", region: "Ontario", tier: "current" },
  { slug: "windsor", name: "University of Windsor", shortName: "Windsor", region: "Ontario", tier: "current" },
  { slug: "western", name: "Western University", shortName: "Western", region: "Ontario", tier: "current" },
  { slug: "york", name: "York University", shortName: "York", region: "Ontario", tier: "current" },
  { slug: "university-of-ottawa", name: "University of Ottawa", shortName: "uOttawa", region: "Ontario", tier: "limited" },
  { slug: "mcmaster-university", name: "McMaster University", shortName: "McMaster", region: "Ontario", tier: "limited" },
  { slug: "the-ottawa-hospital", name: "The Ottawa Hospital", shortName: "TOH", region: "Ontario", tier: "limited" },
  { slug: "baycrest-hospital", name: "Baycrest Hospital", shortName: "Baycrest", region: "Ontario", tier: "limited" },
  { slug: "michael-garron-hospital", name: "Michael Garron Hospital", shortName: "Michael Garron", region: "Ontario", tier: "limited" },
  { slug: "children-s-hospital-of-eastern-ontario", name: "Children's Hospital of Eastern Ontario", shortName: "CHEO", region: "Ontario", tier: "limited" },

  // ── Quebec (7) ──
  { slug: "universite-de-montreal", name: "Université de Montréal", shortName: "UdeM", region: "Quebec", tier: "limited" },
  { slug: "universite-laval", name: "Université Laval", shortName: "Laval", region: "Quebec", tier: "limited" },
  { slug: "mcgill-university", name: "McGill University", shortName: "McGill", region: "Quebec", tier: "limited" },
  { slug: "ecole-polytechnique-de-montreal", name: "École Polytechnique de Montréal", shortName: "Polytechnique", region: "Quebec", tier: "limited" },
  { slug: "institut-national-de-la-recherche-scientifique", name: "Institut national de la recherche scientifique", shortName: "INRS", region: "Quebec", tier: "limited" },
  { slug: "centre-hospitalier-universitaire-sainte-justine", name: "Centre hospitalier Universitaire Sainte-Justine", shortName: "Sainte-Justine", region: "Quebec", tier: "limited" },
  { slug: "universite-de-sherbrooke", name: "Université de Sherbrooke", shortName: "Sherbrooke", region: "Quebec", tier: "limited" },

  // ── Atlantic Canada (2) ──
  { slug: "dalhousie-university", name: "Dalhousie University", shortName: "Dalhousie", region: "Atlantic Canada", tier: "limited" },
  { slug: "memorial-university", name: "Memorial University", shortName: "Memorial", region: "Atlantic Canada", tier: "limited" },
];

/** The 14 institutions whose trainees may apply to VentureLift. */
export const VENTURE_LIFT_INSTITUTIONS = INSTITUTIONS.filter((i) => i.tier === "current");

/**
 * The institutions eligible for a given stream.
 *
 * VentureConnect is open to every partner institution; VentureLift only
 * to the "current" tier. Callers that render an institution picker MUST
 * go through this rather than reading INSTITUTIONS directly, or a
 * VentureLift applicant is offered institutions that cannot be funded.
 */
export function institutionsForStream(stream: "venture_connect" | "venture_lift"): Institution[] {
  return stream === "venture_lift" ? VENTURE_LIFT_INSTITUTIONS : INSTITUTIONS;
}

/** Whether this institution can apply to the given stream. */
export function isEligibleForStream(
  slug: string | null | undefined,
  stream: "venture_connect" | "venture_lift",
): boolean {
  const inst = findInstitution(slug);
  if (!inst) return false;
  return stream === "venture_connect" || inst.tier === "current";
}

const SLUG_MAP = new Map(INSTITUTIONS.map((i) => [i.slug, i]));

/** Lookup helper. Returns null if the slug isn't in the registry
 *  (e.g. a stale value from before an entry was removed). */
export function findInstitution(slug: string | null | undefined): Institution | null {
  if (!slug) return null;
  return SLUG_MAP.get(slug) ?? null;
}

/** Display label that gracefully handles the "Other" branch. */
export function institutionLabel(
  slug: string | null | undefined,
  other: string | null | undefined,
): string {
  if (slug === "other") return other?.trim() || "Other institution";
  return findInstitution(slug)?.name ?? "—";
}
