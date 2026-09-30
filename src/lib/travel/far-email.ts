/**
 * Universities whose email address hints at a home base more than two
 * hours from 144 College Street.
 *
 * Not proof of anything — a Queen's student can live in Toronto, and a
 * U of T address can belong to somebody in Kingston — so it never changes
 * how anybody is ranked. It is a prompt: somebody who said "local" (or
 * said nothing) from a Kingston address is worth a second look.
 *
 * Pure module.
 */
export interface FarSchool {
  school: string;
  city: string;
}

// Domain → school. Subdomains count (mail.mcgill.ca, cmail.carleton.ca).
const SCHOOLS: Record<string, FarSchool> = {
  "queensu.ca": { school: "Queen's University", city: "Kingston" },
  "uottawa.ca": { school: "University of Ottawa", city: "Ottawa" },
  "carleton.ca": { school: "Carleton University", city: "Ottawa" },
  "mcgill.ca": { school: "McGill University", city: "Montréal" },
  "concordia.ca": { school: "Concordia University", city: "Montréal" },
  "umontreal.ca": { school: "Université de Montréal", city: "Montréal" },
  "polymtl.ca": { school: "Polytechnique Montréal", city: "Montréal" },
  "uqam.ca": { school: "UQAM", city: "Montréal" },
  "ulaval.ca": { school: "Université Laval", city: "Québec City" },
  "usherbrooke.ca": { school: "Université de Sherbrooke", city: "Sherbrooke" },
  "uwindsor.ca": { school: "University of Windsor", city: "Windsor" },
  "laurentian.ca": { school: "Laurentian University", city: "Sudbury" },
  "lakeheadu.ca": { school: "Lakehead University", city: "Thunder Bay" },
  "nipissingu.ca": { school: "Nipissing University", city: "North Bay" },
  "nosm.ca": { school: "NOSM University", city: "Sudbury / Thunder Bay" },
  "dal.ca": { school: "Dalhousie University", city: "Halifax" },
  "smu.ca": { school: "Saint Mary's University", city: "Halifax" },
  "unb.ca": { school: "University of New Brunswick", city: "Fredericton" },
  "mun.ca": { school: "Memorial University", city: "St. John's" },
  "upei.ca": { school: "UPEI", city: "Charlottetown" },
  "umanitoba.ca": { school: "University of Manitoba", city: "Winnipeg" },
  "usask.ca": { school: "University of Saskatchewan", city: "Saskatoon" },
  "uregina.ca": { school: "University of Regina", city: "Regina" },
  "ualberta.ca": { school: "University of Alberta", city: "Edmonton" },
  "ucalgary.ca": { school: "University of Calgary", city: "Calgary" },
  "ubc.ca": { school: "UBC", city: "Vancouver" },
  "sfu.ca": { school: "Simon Fraser University", city: "Vancouver" },
  "uvic.ca": { school: "University of Victoria", city: "Victoria" },
};

/** The far-away school an address belongs to, or null. */
export function farSchoolOf(email: string | null | undefined): FarSchool | null {
  const domain = email?.trim().toLowerCase().split("@")[1];
  if (!domain) return null;
  for (const [d, s] of Object.entries(SCHOOLS)) {
    if (domain === d || domain.endsWith(`.${d}`)) return s;
  }
  return null;
}
