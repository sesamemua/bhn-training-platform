/**
 * What a VentureConnect application must contain before it is submitted.
 *
 * Its own module because there are two ways in now — the signed-in form
 * and the public link — and a public application that skipped a check
 * the other one enforces would be a second standard nobody agreed to.
 *
 * Pure: no Prisma, no session. Takes the saved form, returns what is
 * wrong with it in words an applicant can act on.
 */
import {
  STREAM_BUDGETS,
  wordCount,
  type EquipDocument,
  type VentureConnectFormData,
} from "./types";

const VC_BUDGET_KEYS: (keyof VentureConnectFormData)[] = [
  "budgetAirfare",
  "budgetTrainFare",
  "budgetRideshareTaxi",
  "budgetAccommodation",
  "budgetRegistration",
];
const FOUR_DIGIT_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;


export function sumVcBudget(f: VentureConnectFormData): number {
  return VC_BUDGET_KEYS.reduce<number>((s, k) => s + ((f[k] as number | undefined) ?? 0), 0);
}

/** Required fields + budget cap for VentureConnect. */
export function validateVentureConnect(f: VentureConnectFormData, docs: EquipDocument[]): string[] {
  const errors: string[] = [];

  // Applicant
  if (!f.fullName?.trim())              errors.push("Applicant: Full Name is required");
  if (!f.institutionAffiliation?.trim()) errors.push("Applicant: Institution / Affiliation is required");
  if (!f.departmentProgram?.trim())     errors.push("Applicant: Department / Program is required");
  if (!f.currentRole)                   errors.push("Applicant: Current Role is required");
  if (!f.graduationDate?.trim()) {
    errors.push("Applicant: Graduation Date is required");
  } else if (!FOUR_DIGIT_ISO_DATE.test(f.graduationDate)) {
    errors.push("Applicant: Graduation Date must use a four-digit year (YYYY-MM-DD)");
  }
  if (!f.institutionEmail?.trim())      errors.push("Applicant: Institution Email is required");

  // Company
  if (!f.companyName?.trim())           errors.push("Company: Company Name or Project Title is required");
  if (typeof f.hasBiomanufacturingOrHumanHealthApplication !== "boolean") {
    errors.push("Company: answer the biomanufacturing / human health application question");
  }
  if (!f.ventureDescription || f.ventureDescription.trim().length < 30) {
    errors.push("Company: Venture description needs at least 30 characters");
  }
  if (wordCount(f.ventureDescription) > 500) {
    errors.push("Company: Venture description exceeds the 500-word limit");
  }

  // Funding justification
  if (!f.fundingJustification?.trim()) {
    errors.push("Funding Request Justification is required");
  } else if (f.fundingJustification.trim().length < 30) {
    errors.push("Funding Request Justification needs at least 30 characters");
  }

  /*
   * Event
   *
   * The paper form's own heading is "Event Information (Please Submit
   * One Event Only)", and the whole application is a request to attend
   * ONE named thing. Without these, an application could be submitted
   * with a budget and a justification and nothing saying what it is
   * for — which is not a form a reviewer can decide.
   */
  if (!f.eventCategory)         errors.push("Event: pick a category");
  if (!f.eventName?.trim())     errors.push("Event: Event Name is required");
  if (!f.eventLocation?.trim()) errors.push("Event: Location is required");
  if (!f.eventDates?.trim())    errors.push("Event: Dates are required");

  const ipMilestones = [
    ["Invention disclosure", f.ip?.inventionDisclosureChecked, f.ip?.inventionDisclosureDate],
    ["Provisional patent", f.ip?.provisionalPatentChecked, f.ip?.provisionalPatentDate],
    ["Full patent", f.ip?.fullPatentChecked, f.ip?.fullPatentDate],
    ["Licensed technology", f.ip?.licensedTechnologyChecked, f.ip?.licensedTechnologyDate],
  ] as const;
  const selectedIp = ipMilestones.filter(([, checked]) => checked === true);
  if (selectedIp.length === 0) {
    errors.push("Intellectual Property: select at least one status");
  }
  for (const [label, , date] of selectedIp) {
    if (!date?.trim()) {
      errors.push(`Intellectual Property: ${label} date is required`);
    } else if (!FOUR_DIGIT_ISO_DATE.test(date)) {
      errors.push(`Intellectual Property: ${label} date must use a four-digit year (YYYY-MM-DD)`);
    }
  }

  // Budget
  const total = sumVcBudget(f);
  if (total <= 0) errors.push("At least one budget line item must be set");
  if (total > STREAM_BUDGETS.venture_connect) {
    errors.push(`Total budget exceeds the $${STREAM_BUDGETS.venture_connect.toLocaleString()} CAD cap`);
  }
  if (!Array.isArray(f.supportingDocs) || f.supportingDocs.length === 0) {
    errors.push("Supporting documentation: select at least one item");
  }
  if (docs.length === 0) {
    errors.push("Supporting documentation: attach at least one file");
  }

  // Signature attestation
  if (f.acknowledged !== true) errors.push("Signature: please tick the acknowledgement checkbox");
  if (!f.signaturePrintedName?.trim()) errors.push("Signature: Print Name is required");
  if (!f.signatureDate?.trim()) {
    errors.push("Signature: Date is required");
  } else if (!FOUR_DIGIT_ISO_DATE.test(f.signatureDate)) {
    errors.push("Signature: Date must use a four-digit year (YYYY-MM-DD)");
  }

  return errors;
}

/** Required fields + 100-word limits + full eligibility checklist
 *  for VentureLift pre-screening. */
