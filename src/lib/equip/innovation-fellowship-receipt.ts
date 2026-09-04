import {
  INNOVATION_FELLOWSHIP_IP_STATUSES,
  INNOVATION_FELLOWSHIP_OPPORTUNITIES,
  type ApplicantRole,
  type InnovationFellowshipFormData,
} from "./types";
import type { ReceiptSection } from "./venture-connect-receipt";

interface InnovationFellowshipReceiptInput {
  applicationId: string;
  submittedAt: Date;
  formData: InnovationFellowshipFormData;
}

// Who gets BCC'd on the submission receipt used to be hardcoded here.
// It's now admin-editable — see getEquipCopyRecipients() in
// lib/equip/emails.ts, which carries the same addresses as its default.

const ROLE_LABELS: Record<ApplicantRole, string> = {
  master_student: "Master's Student",
  phd_student: "PhD Student",
  postdoc: "Postdoctoral Fellow",
  research_associate: "Research Associate",
};

function value(value: string | number | null | undefined): string {
  if (typeof value === "number") return value.toLocaleString("en-CA");
  return value?.trim() || "Not provided";
}

function yesNo(answer: boolean | undefined): string {
  return answer === true ? "Yes" : answer === false ? "No" : "Not provided";
}

function formatCad(amount: number | undefined): string {
  return typeof amount === "number" && Number.isFinite(amount)
    ? `${amount.toLocaleString("en-CA", { style: "currency", currency: "CAD" })} CAD`
    : "Not provided";
}

function formatSubmittedAt(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  }).format(date);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function opportunityLabel(formData: InnovationFellowshipFormData): string {
  return INNOVATION_FELLOWSHIP_OPPORTUNITIES.find((item) => item.id === formData.opportunity)?.label
    ?? "Not provided";
}

function ipLabel(formData: InnovationFellowshipFormData): string {
  const labels: string[] = (formData.ipStatuses ?? []).map((status) =>
    INNOVATION_FELLOWSHIP_IP_STATUSES.find((item) => item.id === status)?.label ?? status,
  );
  if (formData.ipStatuses?.includes("other") && formData.ipOther?.trim()) {
    labels.push(`Other: ${formData.ipOther.trim()}`);
  }
  return labels.length ? labels.join("\n") : "Not provided";
}

function previousFunding(formData: InnovationFellowshipFormData): string {
  if (formData.receivedPreviousFunding === false) return "No previous funding";
  const rows = (formData.previousFunding ?? []).filter((row) =>
    row.source?.trim() || row.amount || row.date?.trim() || row.purpose?.trim(),
  );
  if (rows.length === 0) return "No details provided";
  return rows.map((row, index) => [
    `${index + 1}. ${value(row.source)}`,
    formatCad(row.amount),
    value(row.date),
    value(row.purpose),
  ].join(" | ")).join("\n");
}

function fellowshipMilestones(formData: InnovationFellowshipFormData): string {
  const rows = (formData.fellowshipMilestones ?? []).filter((row) =>
    row.expectedOutcome?.trim() || row.targetDate?.trim(),
  );
  return rows.length
    ? rows.map((row, index) => `${index + 1}. ${value(row.expectedOutcome)} | ${value(row.targetDate)}`).join("\n")
    : "Not provided";
}

export function innovationFellowshipReceiptSections(
  formData: InnovationFellowshipFormData,
): ReceiptSection[] {
  const sections: ReceiptSection[] = [
    {
      heading: "Opportunity",
      rows: [{ label: "Applying for", value: opportunityLabel(formData) }],
    },
    {
      heading: "Applicant information",
      rows: [
        { label: "Applicant name", value: value(formData.fullName) },
        { label: "Email", value: value(formData.institutionEmail) },
        { label: "Institution", value: value(formData.institutionAffiliation) },
        { label: "Department / Program", value: value(formData.departmentProgram) },
        { label: "Supervisor / Principal Investigator", value: value(formData.supervisorName) },
        { label: "Supervisor / Principal Investigator Email", value: value(formData.supervisorEmail) },
        { label: "Applicant status", value: formData.currentRole ? ROLE_LABELS[formData.currentRole] : "Not provided" },
        { label: "Expected Graduation / End of Appointment Date", value: value(formData.graduationDate) },
        { label: "Role in the venture", value: value(formData.ventureRole) },
        { label: "Current time dedicated to the venture", value: value(formData.ventureTimeCommitment) },
        { label: "Other salary, stipend, or fellowship support", value: yesNo(formData.receivesOtherSupport) },
        ...(formData.receivesOtherSupport
          ? [{ label: "Other support details", value: value(formData.otherSupportDetails) }]
          : []),
      ],
    },
    {
      heading: "Venture / innovation information",
      rows: [
        { label: "Venture name", value: value(formData.ventureName) },
        { label: "Website", value: value(formData.companyWebsite) },
        { label: "Intellectual Property", value: ipLabel(formData) },
        { label: "Innovation and problem / solution", value: value(formData.innovationDescription) },
        { label: "Current stage and progress", value: value(formData.ventureStage) },
        { label: "Six-month commercialization roadmap", value: value(formData.commercializationRoadmap) },
        { label: "Market opportunity", value: value(formData.marketOpportunity) },
      ],
    },
    {
      heading: "Funding support",
      rows: [
        { label: "Previously received funding", value: yesNo(formData.receivedPreviousFunding) },
        ...(formData.receivedPreviousFunding
          ? [{ label: "Funding Source | Amount | Date | Purpose", value: previousFunding(formData) }]
          : []),
      ],
    },
  ];

  if (formData.opportunity === "innovation_internship") {
    sections.push({
      heading: "Innovation internship plan",
      rows: [
        { label: "Host organization", value: value(formData.internshipHostOrganization) },
        { label: "Proposed internship dates", value: `${value(formData.internshipStartDate)} to ${value(formData.internshipEndDate)}` },
        { label: "Internship / Program name", value: value(formData.internshipProgramName) },
        { label: "Importance for entrepreneurial development", value: value(formData.internshipImportance) },
        { label: "How the experience will be applied", value: value(formData.internshipApplication) },
      ],
    });
  } else {
    sections.push({
      heading: "Trainee entrepreneur fellowship plan",
      rows: [
        { label: "Six-month fellowship plan", value: value(formData.fellowshipPlan) },
        { label: "Proposed milestones | Target Date", value: fellowshipMilestones(formData) },
        { label: "Contribution to commercialization", value: value(formData.fellowshipCommercialization) },
      ],
    });
  }

  sections.push({
    heading: "Signatures",
    rows: [
      { label: "Terms and conditions acknowledged", value: yesNo(formData.acknowledged) },
      { label: "Applicant", value: `${value(formData.applicantSignatureName)} | ${value(formData.applicantSignatureDate)}` },
      { label: "Supervisor", value: `${value(formData.supervisorSignatureName)} | ${value(formData.supervisorSignatureDate)}` },
      { label: "Program manager", value: "For BioHubNet use only" },
    ],
  });

  return sections;
}

function renderText(input: InnovationFellowshipReceiptInput, sections: ReceiptSection[]): string {
  const details = sections.flatMap((section) => [
    section.heading.toUpperCase(),
    ...section.rows.map((row) => `${row.label}:\n${row.value}`),
    "",
  ]);
  return [
    `Hi ${input.formData.fullName?.trim() || "there"},`,
    "",
    "Thank you. BioHubNet has received your EQUIP Innovation Fellowship application.",
    `Application reference: ${input.applicationId}`,
    `Submitted: ${formatSubmittedAt(input.submittedAt)}`,
    "",
    ...details,
    "Your complete application packet is attached as one PDF. It includes your submitted answers and every uploaded supporting file.",
    "",
    "The EQUIP team will contact you after reviewing the application.",
    "Questions? Contact equip@biohubnet.ca.",
  ].join("\n");
}

function renderHtml(input: InnovationFellowshipReceiptInput, sections: ReceiptSection[]): string {
  const sectionHtml = sections.map((section) => `
    <tr><td style="padding:22px 0 8px;font-size:13px;font-weight:700;color:#0b5566;">${escapeHtml(section.heading)}</td></tr>
    ${section.rows.map((row) => `
      <tr><td style="padding:7px 0;border-top:1px solid #e2e8f0;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;">${escapeHtml(row.label)}</div>
        <div style="margin-top:3px;font-size:14px;line-height:1.55;color:#0f172a;white-space:pre-wrap;overflow-wrap:anywhere;">${escapeHtml(row.value)}</div>
      </td></tr>`).join("")}
  `).join("");

  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:28px;">
        <tr><td style="font-size:11px;font-weight:700;letter-spacing:1.8px;color:#0b5566;">BIOHUBNET EQUIP</td></tr>
        <tr><td style="padding-top:8px;font-size:25px;font-weight:700;">Application received</td></tr>
        <tr><td style="padding-top:9px;font-size:14px;line-height:1.6;color:#475569;">Thank you, ${escapeHtml(input.formData.fullName?.trim() || "applicant")}. We have received your Innovation Fellowship application.</td></tr>
        <tr><td style="padding-top:16px;font-size:12px;line-height:1.6;color:#475569;"><strong>Reference:</strong> ${escapeHtml(input.applicationId)}<br><strong>Submitted:</strong> ${escapeHtml(formatSubmittedAt(input.submittedAt))}</td></tr>
        ${sectionHtml}
        <tr><td style="padding:18px 0 0;font-size:12.5px;line-height:1.6;color:#64748b;">Your complete application packet is attached as one PDF. It includes your submitted answers and every uploaded supporting file.</td></tr>
        <tr><td style="padding:16px 0 0;font-size:14px;line-height:1.65;color:#334155;">The EQUIP team will contact you after reviewing the application.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

export function buildInnovationFellowshipSubmissionReceipt(
  input: InnovationFellowshipReceiptInput,
): { subject: string; text: string; html: string } {
  const sections = innovationFellowshipReceiptSections(input.formData);
  return {
    subject: "We received your EQUIP Innovation Fellowship application",
    text: renderText(input, sections),
    html: renderHtml(input, sections),
  };
}
