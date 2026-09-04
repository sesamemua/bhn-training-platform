import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInnovationFellowshipSubmissionReceipt,
  innovationFellowshipReceiptSections,
} from "../../src/lib/equip/innovation-fellowship-receipt";
import type { InnovationFellowshipFormData } from "../../src/lib/equip/types";

const formData: InnovationFellowshipFormData = {
  opportunity: "innovation_internship",
  fullName: "Amara Okonkwo",
  institutionEmail: "amara@example.org",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Biomedical Engineering",
  supervisorName: "Dr. Avery Park",
  supervisorEmail: "avery@example.org",
  currentRole: "phd_student",
  graduationDate: "2027-06-30",
  ventureRole: "Co-founder",
  ventureTimeCommitment: "20 hours per week",
  receivesOtherSupport: false,
  ventureName: "PuriBio",
  ipStatuses: ["provisional_filed"],
  innovationDescription: "A faster purification platform.",
  ventureStage: "Working prototype.",
  commercializationRoadmap: "Complete a paid pilot.",
  marketOpportunity: "Small-batch biologics manufacturers.",
  receivedPreviousFunding: false,
  internshipHostOrganization: "Creative Destruction Lab",
  internshipStartDate: "2027-01-04",
  internshipEndDate: "2027-06-30",
  internshipProgramName: "Health Stream",
  internshipImportance: "Build financing skills and investor relationships.",
  internshipApplication: "Apply customer discovery to the venture.",
  acknowledged: true,
  applicantSignatureName: "Amara Okonkwo",
  applicantSignatureDate: "2026-08-31",
  supervisorSignatureName: "Dr. Avery Park",
  supervisorSignatureDate: "2026-08-31",
};

test("the receipt includes the selected opportunity and conditional internship answers", () => {
  const receipt = buildInnovationFellowshipSubmissionReceipt({
    applicationId: "if-reference-123",
    submittedAt: new Date("2026-08-31T20:15:00.000Z"),
    formData,
  });
  assert.match(receipt.subject, /Innovation Fellowship/);
  assert.match(receipt.text, /Innovation Internship/);
  assert.match(receipt.text, /Creative Destruction Lab/);
  assert.match(receipt.text, /if-reference-123/);
  assert.match(receipt.html, /complete application packet is attached/i);
});

test("review sections include signatures and internal program-manager handling", () => {
  const sections = innovationFellowshipReceiptSections(formData);
  const signatures = sections.find((section) => section.heading === "Signatures");
  assert.ok(signatures);
  assert.ok(signatures.rows.some((row) => row.label === "Supervisor" && row.value.includes("Avery Park")));
  assert.ok(signatures.rows.some((row) => row.label === "Program manager" && row.value.includes("BioHubNet use only")));
});
