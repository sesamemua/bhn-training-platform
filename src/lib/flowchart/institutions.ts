/**
 * The 41 CBRF/BRIF-affiliated institutions whose HQP are eligible.
 *
 * Grouped by region exactly as BioHubNet publishes them, because that is
 * how someone finds their own institution in a list of 41 — nobody scans
 * alphabetically past thirty names to reach "Université de Sherbrooke".
 * The regions become <optgroup>s in the picker.
 *
 * Each entry also records its SECTOR: hospitals and health networks are
 * not universities, and the registration form asks about academic and
 * health affiliations separately because a clinician-scientist has both.
 */

export const OTHER = "Other";

export const REGIONS = [
  "British Columbia",
  "Prairies",
  "Ontario",
  "Quebec",
  "Atlantic Canada",
] as const;
export type Region = (typeof REGIONS)[number];

/** Which of the two affiliation questions this belongs to. */
export type Sector = "academic" | "health";

export interface Institution {
  name: string;
  region: Region;
  sector: Sector;
}

export const INSTITUTIONS: Institution[] = [
  // ── British Columbia (4) ───────────────────────────────────────────
  { name: "University of British Columbia", region: "British Columbia", sector: "academic" },
  { name: "British Columbia Institute of Technology", region: "British Columbia", sector: "academic" },
  { name: "Simon Fraser University", region: "British Columbia", sector: "academic" },
  { name: "University of Victoria", region: "British Columbia", sector: "academic" },

  // ── Prairies (8) ───────────────────────────────────────────────────
  { name: "Vaccine and Infectious Disease Organization (VIDO)", region: "Prairies", sector: "academic" },
  { name: "University of Saskatchewan", region: "Prairies", sector: "academic" },
  { name: "University of Alberta", region: "Prairies", sector: "academic" },
  { name: "University of Calgary", region: "Prairies", sector: "academic" },
  { name: "University of Manitoba", region: "Prairies", sector: "academic" },
  { name: "Concordia University of Edmonton", region: "Prairies", sector: "academic" },
  { name: "University of Lethbridge", region: "Prairies", sector: "academic" },
  { name: "University of Regina", region: "Prairies", sector: "academic" },

  // ── Ontario (20) ───────────────────────────────────────────────────
  { name: "Hospital for Sick Children", region: "Ontario", sector: "health" },
  { name: "Queen's University", region: "Ontario", sector: "academic" },
  { name: "Seneca Polytechnic", region: "Ontario", sector: "academic" },
  { name: "Sinai Health", region: "Ontario", sector: "health" },
  { name: "Sunnybrook Research Institute", region: "Ontario", sector: "health" },
  { name: "Toronto Metropolitan University", region: "Ontario", sector: "academic" },
  { name: "Unity Health Toronto", region: "Ontario", sector: "health" },
  { name: "University Health Network", region: "Ontario", sector: "health" },
  { name: "University of Guelph", region: "Ontario", sector: "academic" },
  { name: "University of Toronto", region: "Ontario", sector: "academic" },
  { name: "University of Waterloo", region: "Ontario", sector: "academic" },
  { name: "University of Windsor", region: "Ontario", sector: "academic" },
  { name: "Western University", region: "Ontario", sector: "academic" },
  { name: "York University", region: "Ontario", sector: "academic" },
  { name: "University of Ottawa", region: "Ontario", sector: "academic" },
  { name: "McMaster University", region: "Ontario", sector: "academic" },
  { name: "The Ottawa Hospital", region: "Ontario", sector: "health" },
  { name: "Baycrest Hospital", region: "Ontario", sector: "health" },
  { name: "Michael Garron Hospital", region: "Ontario", sector: "health" },
  { name: "Children's Hospital of Eastern Ontario", region: "Ontario", sector: "health" },

  // ── Quebec (7) ─────────────────────────────────────────────────────
  { name: "Université de Montréal", region: "Quebec", sector: "academic" },
  { name: "Université Laval", region: "Quebec", sector: "academic" },
  { name: "McGill University", region: "Quebec", sector: "academic" },
  { name: "École Polytechnique de Montréal", region: "Quebec", sector: "academic" },
  { name: "Institut national de la recherche scientifique", region: "Quebec", sector: "academic" },
  { name: "Centre hospitalier Universitaire Sainte-Justine", region: "Quebec", sector: "health" },
  { name: "Université de Sherbrooke", region: "Quebec", sector: "academic" },

  // ── Atlantic Canada (2) ────────────────────────────────────────────
  { name: "Dalhousie University", region: "Atlantic Canada", sector: "academic" },
  { name: "Memorial University", region: "Atlantic Canada", sector: "academic" },
];

/** Institutions of one sector, grouped by region in published order. */
export function groupedBySector(sector: Sector): { region: Region; names: string[] }[] {
  return REGIONS.map((region) => ({
    region,
    names: INSTITUTIONS.filter((i) => i.sector === sector && i.region === region).map((i) => i.name),
  })).filter((g) => g.names.length > 0);
}

export const ACADEMIC_INSTITUTIONS: string[] = INSTITUTIONS.filter((i) => i.sector === "academic").map((i) => i.name);
export const HEALTH_ORGANISATIONS: string[] = INSTITUTIONS.filter((i) => i.sector === "health").map((i) => i.name);

/** Look one up by the name stored on an answer. */
export function findInstitution(name: string): Institution | undefined {
  return INSTITUTIONS.find((i) => i.name === name);
}

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
