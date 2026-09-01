import test from "node:test";
import assert from "node:assert/strict";
import { validateInnovationFellowship } from "../../src/lib/equip/innovation-fellowship-validation";
import type { InnovationFellowshipFormData } from "../../src/lib/equip/types";

const validFellowship: InnovationFellowshipFormData = {
  opportunity: "trainee_fellowship_grad",
  fullName: "Amara Okonkwo",
  institutionEmail: "amara@example.org",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Biomedical Engineering",
  supervisorName: "Dr. Avery Park",
  supervisorEmail: "avery@example.org",
  currentRole: "phd_student",
  graduationDate: "2027-06-30",
  ventureRole: "Co-founder and scientific lead",
  ventureTimeCommitment: "20 hours per week",
  receivesOtherSupport: false,
  ventureName: "PuriBio",
  companyWebsite: "https://example.org",
  ipStatuses: ["provisional_filed"],
  innovationDescription: "A faster downstream purification platform for biologics manufacturing.",
  ventureStage: "A working prototype has been validated with three model proteins.",
  commercializationRoadmap: "Complete a paid pilot and prepare the seed financing data room.",
  marketOpportunity: "Early-stage biologics companies need lower-cost purification for small batches.",
  receivedPreviousFunding: true,
  previousFunding: [{
    id: "funding-1",
    source: "University accelerator",
    amount: 25_000,
    date: "2026-03-15",
    purpose: "Prototype development",
  }],
  fellowshipPlan: "Lead customer discovery and complete a six-month validation program.",
  fellowshipMilestones: [{
    id: "milestone-1",
    expectedOutcome: "Complete paid pilot",
    targetDate: "2027-02-28",
  }],
  fellowshipCommercialization: "The pilot will produce the evidence needed for first commercial sales.",
  acknowledged: true,
  applicantSignatureName: "Amara Okonkwo",
  applicantSignatureDate: "2026-08-31",
  supervisorSignatureName: "Dr. Avery Park",
  supervisorSignatureDate: "2026-08-31",
};

test("a complete trainee fellowship application passes validation", () => {
  assert.deepEqual(validateInnovationFellowship(validFellowship), []);
});

test("the selected fellowship must match the applicant status", () => {
  const postdocAsStudent: InnovationFellowshipFormData = {
    ...validFellowship,
    opportunity: "trainee_fellowship_postdoc",
  };
  assert.ok(
    validateInnovationFellowship(postdocAsStudent).some((error) =>
      error.includes("requires Postdoctoral Fellow status"),
    ),
  );

  const graduateAsPostdoc: InnovationFellowshipFormData = {
    ...validFellowship,
    currentRole: "postdoc",
  };
  assert.ok(
    validateInnovationFellowship(graduateAsPostdoc).some((error) =>
      error.includes("requires Master's Student or PhD Student status"),
    ),
  );
});

test("the innovation internship branch requires its own host, dates, and plan", () => {
  const form: InnovationFellowshipFormData = {
    ...validFellowship,
    opportunity: "innovation_internship",
  };
  const errors = validateInnovationFellowship(form);
  assert.ok(errors.some((error) => error.includes("Internship: Host Organization")));
  assert.ok(errors.some((error) => error.includes("Internship: Start Date")));
  assert.ok(errors.some((error) => error.includes("Internship: Entrepreneurial development plan")));
  assert.ok(!errors.some((error) => error.includes("Fellowship: Six-month plan")));
});

test("a complete innovation internship application passes validation", () => {
  const form: InnovationFellowshipFormData = {
    ...validFellowship,
    opportunity: "innovation_internship",
    internshipHostOrganization: "Creative Destruction Lab",
    internshipStartDate: "2027-01-04",
    internshipEndDate: "2027-06-30",
    internshipProgramName: "Health Stream",
    internshipImportance: "Build venture-financing skills and a network of health investors.",
    internshipApplication: "Use the program's customer discovery process to validate the venture.",
  };
  assert.deepEqual(validateInnovationFellowship(form), []);
});

test("conditional details, word limits, and four-digit dates are enforced", () => {
  const form: InnovationFellowshipFormData = {
    ...validFellowship,
    receivesOtherSupport: true,
    otherSupportDetails: Array.from({ length: 251 }, () => "support").join(" "),
    graduationDate: "12027-06-30",
    previousFunding: [{ id: "funding-1", source: "Grant", amount: 0, date: "2026-03-15" }],
  };
  const errors = validateInnovationFellowship(form);
  assert.ok(errors.some((error) => error.includes("250-word limit")));
  assert.ok(errors.some((error) => error.includes("four-digit year")));
  assert.ok(errors.some((error) => error.includes("Amount must be greater than zero")));
  assert.ok(errors.some((error) => error.includes("Purpose is required")));
});
