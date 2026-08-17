/**
 * Controlled vocabulary for affiliations.
 *
 * People in this sector routinely hold several at once — a PhD student at
 * a university who is also a clinician at a teaching hospital and a
 * founder of a spin-out is one person, not three. So an affiliation is a
 * repeatable entry rather than a single dropdown, and each entry records
 * the KIND of organisation separately from its name.
 *
 * Every list ends in "Other", which pairs with a free-text box. That is
 * the compromise that keeps the data standardised without lying: the
 * common cases stay countable, and the genuinely unusual ones are still
 * captured verbatim rather than being forced into the nearest wrong box.
 */

export const OTHER = "Other";

/** Name, phone and email, collected as one block. */
export interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export const EMPTY_CONTACT: Contact = { firstName: "", lastName: "", email: "" };

export function contactComplete(c: Contact): boolean {
  return !!c.firstName.trim() && !!c.lastName.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim());
}

/** One named organisation of a given kind, with an Other escape hatch. */
export interface OrgEntry {
  /** The chosen list item, or OTHER. */
  name: string;
  /** Free text when `name` is OTHER. */
  nameOther?: string;
  /** Company only: what kind of company. */
  companyType?: string;
  companyTypeOther?: string;
  department?: string;
  role?: string;
}

export const EMPTY_ORG: OrgEntry = { name: "" };

export function codedOrgName(o: OrgEntry): string {
  return o.name === OTHER ? (o.nameOther?.trim() || OTHER) : o.name;
}

export function codedCompanyType(o: OrgEntry): string {
  return o.companyType === OTHER ? (o.companyTypeOther?.trim() || OTHER) : (o.companyType ?? "");
}

export function orgComplete(o: OrgEntry): boolean {
  return !!codedOrgName(o).trim() && codedOrgName(o) !== OTHER;
}

/** What kind of organisation it is. Drives most of the useful reporting. */
export const ORG_TYPES = [
  "University",
  "Teaching hospital or health network",
  "Research institute",
  "Company — private",
  "Company — publicly traded",
  "Startup or spin-out",
  "Government or public agency",
  "Not-for-profit",
  "Funding body",
  OTHER,
] as const;

/** What the person does there — separate from the organisation's kind. */
export const ROLES = [
  "Undergraduate student",
  "Master's student",
  "PhD student",
  "Postdoctoral fellow",
  "Research associate or technician",
  "Faculty or principal investigator",
  "Clinician",
  "Founder or co-founder",
  "Executive or director",
  "Manager",
  "Staff",
  "Consultant or advisor",
  OTHER,
] as const;

export type OrgType = (typeof ORG_TYPES)[number];
export type Role = (typeof ROLES)[number];

/** One affiliation. `orgOther` / `roleOther` carry the free text when the
 *  standardised answer is "Other", so the coded value stays clean. */
export interface Affiliation {
  orgType: string;
  orgOther?: string;
  organisation: string;
  department?: string;
  role: string;
  roleOther?: string;
  /** Exactly one entry should be primary — the one they'd put on a badge. */
  primary?: boolean;
}

export const EMPTY_AFFILIATION: Affiliation = {
  orgType: "",
  organisation: "",
  role: "",
};

/** The value actually stored for reporting: the coded term, or the
 *  free text when they chose Other. */
export function codedOrgType(a: Affiliation): string {
  return a.orgType === OTHER ? (a.orgOther?.trim() || OTHER) : a.orgType;
}

export function codedRole(a: Affiliation): string {
  return a.role === OTHER ? (a.roleOther?.trim() || OTHER) : a.role;
}

/** An affiliation counts as filled in once it names an organisation. */
export function isComplete(a: Affiliation): boolean {
  return !!a.organisation.trim() && !!a.orgType && !!a.role;
}

/** One-line summary, for a chart label or a roster row. */
export function describe(a: Affiliation): string {
  const org = a.organisation.trim() || codedOrgType(a);
  const bits = [codedRole(a), org];
  if (a.department?.trim()) bits.push(a.department.trim());
  return bits.filter(Boolean).join(" · ");
}
