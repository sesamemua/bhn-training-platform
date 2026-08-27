/**
 * The lists a Training Week registrant can be on.
 *
 * One entry per source file. Adding a fourth list later is one entry
 * here plus an import — nothing else in the feature knows how many
 * there are.
 */

export interface EligibilitySource {
  id: string;
  /** Shown to admins. */
  name: string;
  /** Which programmes being on this list makes somebody eligible for. */
  programmes: string[];
  /** Where it lives, so an admin knows what to go and export. */
  url: string;
  /** How the platform can read it today. */
  access: "manual" | "google" | "graph";
  /** One line for the admin page: what this list actually contains. */
  note: string;
}

export const ELIGIBILITY_SOURCES: EligibilitySource[] = [
  {
    id: "engage-experience",
    name: "ENGAGE and EXPERIENCE",
    programmes: ["ENGAGE", "EXPERIENCE"],
    url: "https://docs.google.com/spreadsheets/d/1S5X9erpXvaqCpOj3HtmZiP9pdGsBJmWLGlj27LeNDEg/edit?gid=1366600318",
    access: "google",
    note: "Accepted trainees. One Google Sheet, one tab.",
  },
  {
    id: "equip-venture-connect",
    name: "EQUIP — Venture Connect applications",
    programmes: ["EQUIP"],
    url: "https://utoronto.sharepoint.com/:x:/r/sites/phm-biohubnet/_layouts/15/Doc.aspx?sourcedoc=%7B056266ED-A949-4D84-90AA-CE885050210F%7D&file=Venture%20Connect%20Applicantions.xlsx",
    access: "graph",
    note: "Applicants, not only those with an award — an EQUIP application is enough.",
  },
  {
    id: "equip-venturelift",
    name: "EQUIP — VentureLift pre-screening",
    programmes: ["EQUIP"],
    url: "https://utoronto.sharepoint.com/:x:/r/sites/phm-biohubnet/_layouts/15/Doc.aspx?sourcedoc=%7BC9E585ED-8475-4C22-8E52-AAAF1A4B5ABD%7D&file=VentureLift%20Pre-screening%20Evaluation.xlsx",
    access: "graph",
    note: "Pre-screening evaluations for VentureLift.",
  },
];

const BY_ID = new Map(ELIGIBILITY_SOURCES.map((s) => [s.id, s]));

export function eligibilitySource(id: string): EligibilitySource | null {
  return BY_ID.get(id) ?? null;
}

/* Two ids for one list would make one of them unreachable, and the one
 * that lost would be the list nobody notices is empty. */
if (BY_ID.size !== ELIGIBILITY_SOURCES.length) {
  throw new Error("Duplicate eligibility source id in src/lib/eligibility/sources.ts");
}
