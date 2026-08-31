import {
  EVENT_CATEGORIES,
  SUPPORTING_DOCS,
  type ApplicantRole,
  type VentureConnectFormData,
} from "./types";
import { sumVcBudget } from "./submit-validation";

interface VentureConnectReceiptInput {
  applicationId: string;
  submittedAt: Date;
  formData: VentureConnectFormData;
}

interface ReceiptRow {
  label: string;
  value: string;
}

interface ReceiptSection {
  heading: string;
  rows: ReceiptRow[];
}

const ROLE_LABELS: Record<ApplicantRole, string> = {
  master_student: "Master's Student",
  phd_student: "PhD Student",
  postdoc: "Postdoctoral Fellow",
  research_associate: "Research Associate",
};

const EVENT_CATEGORY_LABELS = new Map(
  EVENT_CATEGORIES.map(({ id, label }) => [id, label]),
);
const SUPPORTING_DOCUMENT_LABELS = new Map(
  SUPPORTING_DOCS.map(({ id, label }) => [id, label]),
);

function present(value: string | undefined | null): string {
  return value?.trim() || "Not provided";
}

function yesNo(value: boolean | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not provided";
}

function formatDate(value: string | undefined): string {
  if (!value) return "Not provided";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}

function formatSubmittedAt(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  }).format(value);
}

function formatCad(value: number | undefined): string {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${amount.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  })} CAD`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function selectedIp(formData: VentureConnectFormData): string {
  const choices = [
    ["Invention disclosure", formData.ip?.inventionDisclosureChecked, formData.ip?.inventionDisclosureDate],
    ["Provisional patent", formData.ip?.provisionalPatentChecked, formData.ip?.provisionalPatentDate],
    ["Full patent", formData.ip?.fullPatentChecked, formData.ip?.fullPatentDate],
    ["Licensed technology", formData.ip?.licensedTechnologyChecked, formData.ip?.licensedTechnologyDate],
  ] as const;
  const selected = choices
    .filter(([, checked]) => checked === true)
    .map(([label, , date]) => `${label}: ${formatDate(date)}`);
  return selected.length ? selected.join("\n") : "None selected";
}

function selectedSupportingDocuments(formData: VentureConnectFormData): string {
  const selected = (formData.supportingDocs ?? []).map(
    (id) => SUPPORTING_DOCUMENT_LABELS.get(id) ?? id,
  );
  return selected.length ? selected.join("\n") : "None selected";
}

function receiptSections(formData: VentureConnectFormData): ReceiptSection[] {
  return [
    {
      heading: "Applicant information",
      rows: [
        { label: "Full name", value: present(formData.fullName) },
        { label: "Institution / affiliation", value: present(formData.institutionAffiliation) },
        { label: "Department / program", value: present(formData.departmentProgram) },
        {
          label: "Current role",
          value: formData.currentRole ? ROLE_LABELS[formData.currentRole] : "Not provided",
        },
        { label: "Graduation date", value: formatDate(formData.graduationDate) },
        { label: "Institution email", value: present(formData.institutionEmail) },
      ],
    },
    {
      heading: "Company or project",
      rows: [
        { label: "Company name or project title", value: present(formData.companyName) },
        { label: "Website", value: present(formData.companyWebsite) },
        {
          label: "Biomanufacturing / human health application",
          value: yesNo(formData.hasBiomanufacturingOrHumanHealthApplication),
        },
        { label: "Venture or innovation", value: present(formData.ventureDescription) },
      ],
    },
    {
      heading: "Intellectual property",
      rows: [{ label: "Selected status and date", value: selectedIp(formData) }],
    },
    {
      heading: "Funding request",
      rows: [{ label: "Justification", value: present(formData.fundingJustification) }],
    },
    {
      heading: "Event information",
      rows: [
        {
          label: "Category",
          value: formData.eventCategory
            ? EVENT_CATEGORY_LABELS.get(formData.eventCategory) ?? formData.eventCategory
            : "Not provided",
        },
        { label: "Event name", value: present(formData.eventName) },
        { label: "Location", value: present(formData.eventLocation) },
        { label: "Dates", value: present(formData.eventDates) },
      ],
    },
    {
      heading: "Budget and supporting documentation",
      rows: [
        { label: "Airfare", value: formatCad(formData.budgetAirfare) },
        { label: "Train fare", value: formatCad(formData.budgetTrainFare) },
        { label: "Rideshare / taxi", value: formatCad(formData.budgetRideshareTaxi) },
        { label: "Accommodation", value: formatCad(formData.budgetAccommodation) },
        { label: "Registration", value: formatCad(formData.budgetRegistration) },
        { label: "Total requested", value: formatCad(sumVcBudget(formData)) },
        {
          label: "Supporting documentation selected",
          value: selectedSupportingDocuments(formData),
        },
      ],
    },
    {
      heading: "Signature",
      rows: [
        { label: "Acknowledged", value: yesNo(formData.acknowledged) },
        { label: "Print name", value: present(formData.signaturePrintedName) },
        { label: "Date", value: formatDate(formData.signatureDate) },
      ],
    },
  ];
}

function renderText(input: VentureConnectReceiptInput, sections: ReceiptSection[]): string {
  const details = sections.flatMap((section) => [
    section.heading.toUpperCase(),
    ...section.rows.flatMap((row) => [`${row.label}:`, row.value, ""]),
  ]);
  return [
    `Hi ${present(input.formData.fullName)},`,
    "",
    "Thank you. We have received your VentureConnect application.",
    `Application reference: ${input.applicationId}`,
    `Submitted: ${formatSubmittedAt(input.submittedAt)}`,
    "",
    ...details,
    "Uploaded files are stored with your application and are not included in this email.",
    "",
    "The EQUIP team will contact you after reviewing the current funding cycle.",
    "Questions? Contact equip@biohubnet.ca.",
    "",
    "BioHubNet EQUIP",
  ].join("\n");
}

function renderHtml(input: VentureConnectReceiptInput, sections: ReceiptSection[]): string {
  const sectionHtml = sections.map((section) => {
    const rows = section.rows.map((row) => `
      <tr>
        <td style="width:38%;padding:9px 12px 9px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:12px;font-weight:700;line-height:1.5;color:#475569;">${escapeHtml(row.label)}</td>
        <td style="padding:9px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:13px;line-height:1.55;color:#0f172a;white-space:pre-wrap;">${escapeHtml(row.value).replace(/\n/g, "<br>")}</td>
      </tr>`).join("");
    return `
      <tr><td style="padding:22px 0 8px;font-size:15px;font-weight:800;color:#0b5566;">${escapeHtml(section.heading)}</td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
      </td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">Your VentureConnect application details and reference number.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f1f5f9;">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;border-collapse:collapse;">
      <tr><td style="padding:0 0 16px;font-size:13px;font-weight:800;color:#0b5566;">BIOHUBNET &nbsp;|&nbsp; EQUIP</td></tr>
      <tr><td style="padding:32px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><td style="padding:0 0 10px;font-size:22px;font-weight:800;line-height:1.3;color:#0f172a;">Application received</td></tr>
          <tr><td style="padding:0 0 12px;font-size:14px;line-height:1.65;color:#334155;">Hi ${escapeHtml(present(input.formData.fullName))},</td></tr>
          <tr><td style="padding:0 0 16px;font-size:14px;line-height:1.65;color:#334155;">Thank you. We have received your VentureConnect application. A copy of your submitted answers appears below.</td></tr>
          <tr><td style="padding:14px 16px;background:#ecfeff;border-left:3px solid #0e7490;font-size:13px;line-height:1.65;color:#164e63;">
            <strong>Application reference:</strong> ${escapeHtml(input.applicationId)}<br>
            <strong>Submitted:</strong> ${escapeHtml(formatSubmittedAt(input.submittedAt))}
          </td></tr>
          ${sectionHtml}
          <tr><td style="padding:18px 0 0;font-size:12.5px;line-height:1.6;color:#64748b;">Uploaded files are stored with your application and are not included in this email.</td></tr>
          <tr><td style="padding:16px 0 0;font-size:14px;line-height:1.65;color:#334155;">The EQUIP team will contact you after reviewing the current funding cycle.</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 8px 0;font-size:12px;line-height:1.6;color:#64748b;">Questions? Contact <a href="mailto:equip@biohubnet.ca" style="color:#0b5566;text-decoration:none;">equip@biohubnet.ca</a>.</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function buildVentureConnectSubmissionReceipt(
  input: VentureConnectReceiptInput,
): { subject: string; text: string; html: string } {
  const sections = receiptSections(input.formData);
  return {
    subject: "We received your VentureConnect application",
    text: renderText(input, sections),
    html: renderHtml(input, sections),
  };
}
