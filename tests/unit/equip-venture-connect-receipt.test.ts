import test from "node:test";
import assert from "node:assert/strict";
import { buildVentureConnectSubmissionReceipt } from "../../src/lib/equip/venture-connect-receipt";
import type { VentureConnectFormData } from "../../src/lib/equip/types";

const formData: VentureConnectFormData = {
  fullName: "Dr. Amara <Okonkwo>",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Biomedical Engineering",
  currentRole: "phd_student",
  graduationDate: "2027-06-30",
  institutionEmail: "amara@example.org",
  companyName: "PuriBio & Partners",
  companyWebsite: "https://example.org",
  hasBiomanufacturingOrHumanHealthApplication: true,
  ventureDescription: "A faster downstream purification platform.",
  ip: {
    inventionDisclosureChecked: true,
    inventionDisclosureDate: "2026-05-01",
    provisionalPatentChecked: true,
    provisionalPatentDate: "2026-08-15",
  },
  fundingJustification: "Meet investors and prospective manufacturing partners.",
  eventCategory: "conference",
  eventName: "BIO International Convention",
  eventLocation: "San Diego, California",
  eventDates: "June 22-25, 2027",
  supportingDocs: ["pitch_deck", "cost_estimates"],
  budgetAirfare: 1200,
  budgetTrainFare: 0,
  budgetRideshareTaxi: 175,
  budgetAccommodation: 1600,
  budgetRegistration: 1500,
  acknowledged: true,
  signaturePrintedName: "Amara Okonkwo",
  signatureDate: "2026-08-31",
};

function receipt(data: VentureConnectFormData = formData) {
  return buildVentureConnectSubmissionReceipt({
    applicationId: "vc-reference-123",
    submittedAt: new Date("2026-08-31T20:15:00.000Z"),
    formData: data,
  });
}

test("the receipt includes the complete submitted form and calculated total", () => {
  const email = receipt();
  for (const detail of [
    "vc-reference-123",
    "University of Toronto",
    "Biomedical Engineering",
    "PhD Student",
    "PuriBio & Partners",
    "A faster downstream purification platform.",
    "Invention disclosure",
    "Provisional patent",
    "Meet investors and prospective manufacturing partners.",
    "Industry / Investor Conference",
    "BIO International Convention",
    "June 22-25, 2027",
    "$4,475.00 CAD",
    "Business pitch deck",
    "Travel & accommodation cost estimates",
    "Amara Okonkwo",
  ]) {
    assert.ok(email.text.includes(detail), `${detail} missing from text receipt`);
    assert.ok(email.html.includes(detail.replace(/&/g, "&amp;")), `${detail} missing from HTML receipt`);
  }
});

test("uploaded files and their metadata cannot enter the receipt", () => {
  const data = {
    ...formData,
    documents: [{ name: "secret-pitch-deck.pdf", url: "https://files.example/secret" }],
  } as VentureConnectFormData;
  const email = receipt(data);
  assert.ok(!email.text.includes("secret-pitch-deck.pdf"));
  assert.ok(!email.html.includes("secret-pitch-deck.pdf"));
  assert.ok(!email.text.includes("https://files.example/secret"));
  assert.ok(!email.html.includes("https://files.example/secret"));
  assert.match(email.text, /Uploaded files.*not included/i);
});

test("applicant-entered text is escaped in HTML", () => {
  const email = receipt();
  assert.ok(!email.html.includes("<Okonkwo>"));
  assert.ok(email.html.includes("Dr. Amara &lt;Okonkwo&gt;"));
  assert.ok(email.html.includes("PuriBio &amp; Partners"));
});

test("a no answer is preserved and optional values are readable", () => {
  const email = receipt({
    ...formData,
    companyWebsite: "",
    hasBiomanufacturingOrHumanHealthApplication: false,
  });
  assert.match(email.text, /Website:\nNot provided/);
  assert.match(email.text, /Biomanufacturing \/ human health application:\nNo/);
});
