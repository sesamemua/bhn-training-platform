import {
  INNOVATION_FELLOWSHIP_IP_STATUSES,
  INNOVATION_FELLOWSHIP_OPPORTUNITIES,
  innovationFellowshipRoleMatchesOpportunity,
  wordCount,
  type InnovationFellowshipFormData,
  type InnovationFellowshipFundingRow,
  type InnovationFellowshipMilestone,
} from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FOUR_DIGIT_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPPORTUNITIES = new Set(INNOVATION_FELLOWSHIP_OPPORTUNITIES.map((item) => item.id));
const IP_STATUSES = new Set(INNOVATION_FELLOWSHIP_IP_STATUSES.map((item) => item.id));

function required(errors: string[], value: string | undefined, label: string): void {
  if (!value?.trim()) errors.push(`${label} is required`);
}

function date(errors: string[], value: string | undefined, label: string): void {
  if (!value?.trim()) {
    errors.push(`${label} is required`);
  } else if (!FOUR_DIGIT_ISO_DATE.test(value)) {
    errors.push(`${label} must use a four-digit year (YYYY-MM-DD)`);
  }
}

function maxWords(errors: string[], value: string | undefined, limit: number, label: string): void {
  if (wordCount(value) > limit) errors.push(`${label} exceeds the ${limit}-word limit`);
}

function fundingRowHasValue(row: InnovationFellowshipFundingRow): boolean {
  return Boolean(row.source?.trim() || row.amount || row.date?.trim() || row.purpose?.trim());
}

function milestoneHasValue(row: InnovationFellowshipMilestone): boolean {
  return Boolean(row.expectedOutcome?.trim() || row.targetDate?.trim());
}

export function validateInnovationFellowship(form: InnovationFellowshipFormData): string[] {
  const errors: string[] = [];

  if (!form.opportunity || !OPPORTUNITIES.has(form.opportunity)) {
    errors.push("Opportunity: select the fellowship or internship you are applying for");
  }

  required(errors, form.fullName, "Applicant: Name");
  if (!form.institutionEmail?.trim()) {
    errors.push("Applicant: Email is required");
  } else if (!EMAIL.test(form.institutionEmail.trim())) {
    errors.push("Applicant: enter a valid email address");
  }
  required(errors, form.institutionAffiliation, "Applicant: Institution");
  required(errors, form.departmentProgram, "Applicant: Department / Program");
  required(errors, form.supervisorName, "Applicant: Supervisor / Principal Investigator Name");
  if (!form.supervisorEmail?.trim()) {
    errors.push("Applicant: Supervisor / Principal Investigator Email is required");
  } else if (!EMAIL.test(form.supervisorEmail.trim())) {
    errors.push("Applicant: enter a valid supervisor email address");
  }
  if (!form.currentRole) errors.push("Applicant: Status is required");
  if (
    form.opportunity &&
    form.currentRole &&
    !innovationFellowshipRoleMatchesOpportunity(form.opportunity, form.currentRole)
  ) {
    errors.push(
      form.opportunity === "trainee_fellowship_postdoc"
        ? "Applicant: Postdoctoral Fellowship requires Postdoctoral Fellow status"
        : "Applicant: Master's / PhD Fellowship requires Master's Student or PhD Student status",
    );
  }
  date(errors, form.graduationDate, "Applicant: Expected Graduation / End of Appointment Date");
  required(errors, form.ventureRole, "Applicant: Role in the venture");
  required(errors, form.ventureTimeCommitment, "Applicant: Current time dedicated to the venture");
  if (typeof form.receivesOtherSupport !== "boolean") {
    errors.push("Applicant: answer whether you receive other salary, stipend, or fellowship support");
  }
  if (form.receivesOtherSupport === true) {
    required(errors, form.otherSupportDetails, "Applicant: Other support details");
    maxWords(errors, form.otherSupportDetails, 250, "Applicant: Other support details");
  }

  required(errors, form.ventureName, "Venture: Name");
  const ipStatuses = (form.ipStatuses ?? []).filter((status) => IP_STATUSES.has(status));
  if (ipStatuses.length === 0) errors.push("Venture: select at least one Intellectual Property status");
  if (ipStatuses.includes("other")) required(errors, form.ipOther, "Venture: Other IP status");
  required(errors, form.innovationDescription, "Venture: Innovation description");
  maxWords(errors, form.innovationDescription, 750, "Venture: Innovation description");
  required(errors, form.ventureStage, "Venture: Current stage and progress");
  maxWords(errors, form.ventureStage, 750, "Venture: Current stage and progress");
  required(errors, form.commercializationRoadmap, "Venture: Six-month commercialization roadmap");
  maxWords(errors, form.commercializationRoadmap, 500, "Venture: Six-month commercialization roadmap");
  required(errors, form.marketOpportunity, "Venture: Market opportunity");
  maxWords(errors, form.marketOpportunity, 500, "Venture: Market opportunity");

  if (typeof form.receivedPreviousFunding !== "boolean") {
    errors.push("Funding: answer whether the venture previously received funding");
  }
  if (form.receivedPreviousFunding === true) {
    const rows = (form.previousFunding ?? []).filter(fundingRowHasValue);
    if (rows.length === 0) errors.push("Funding: provide at least one previous funding entry");
    rows.forEach((row, index) => {
      const label = `Funding entry ${index + 1}`;
      required(errors, row.source, `${label}: Source`);
      if (!(typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount > 0)) {
        errors.push(`${label}: Amount must be greater than zero`);
      }
      date(errors, row.date, `${label}: Date`);
      required(errors, row.purpose, `${label}: Purpose`);
    });
  }

  const isInternship = form.opportunity === "innovation_internship";
  if (isInternship) {
    required(errors, form.internshipHostOrganization, "Internship: Host Organization");
    date(errors, form.internshipStartDate, "Internship: Start Date");
    date(errors, form.internshipEndDate, "Internship: End Date");
    if (
      FOUR_DIGIT_ISO_DATE.test(form.internshipStartDate ?? "") &&
      FOUR_DIGIT_ISO_DATE.test(form.internshipEndDate ?? "") &&
      (form.internshipStartDate ?? "") > (form.internshipEndDate ?? "")
    ) {
      errors.push("Internship: End Date must be on or after Start Date");
    }
    required(errors, form.internshipProgramName, "Internship: Program Name");
    required(errors, form.internshipImportance, "Internship: Entrepreneurial development plan");
    maxWords(errors, form.internshipImportance, 500, "Internship: Entrepreneurial development plan");
    required(errors, form.internshipApplication, "Internship: How the experience will be applied");
    maxWords(errors, form.internshipApplication, 500, "Internship: How the experience will be applied");
  } else if (form.opportunity) {
    required(errors, form.fellowshipPlan, "Fellowship: Six-month plan");
    maxWords(errors, form.fellowshipPlan, 750, "Fellowship: Six-month plan");
    const milestones = (form.fellowshipMilestones ?? []).filter(milestoneHasValue);
    if (milestones.length === 0) errors.push("Fellowship: provide at least one proposed milestone");
    if (milestones.length > 4) errors.push("Fellowship: provide no more than four proposed milestones");
    milestones.forEach((row, index) => {
      const label = `Fellowship milestone ${index + 1}`;
      required(errors, row.expectedOutcome, `${label}: Expected Outcome`);
      date(errors, row.targetDate, `${label}: Target Date`);
    });
    required(errors, form.fellowshipCommercialization, "Fellowship: Commercialization contribution");
    maxWords(errors, form.fellowshipCommercialization, 500, "Fellowship: Commercialization contribution");
  }

  if (form.acknowledged !== true) errors.push("Signatures: acknowledge the EQUIP terms and conditions");
  required(errors, form.applicantSignatureName, "Signatures: Applicant Name");
  date(errors, form.applicantSignatureDate, "Signatures: Applicant Date");
  required(errors, form.supervisorSignatureName, "Signatures: Supervisor Name");
  date(errors, form.supervisorSignatureDate, "Signatures: Supervisor Date");

  return errors;
}
