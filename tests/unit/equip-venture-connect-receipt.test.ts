import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVentureConnectSubmissionReceipt,
  VENTURE_CONNECT_SUBMISSION_BCC,
} from "../../src/lib/equip/venture-connect-receipt";
import type { VentureConnectFormData } from "../../src/lib/equip/types";

const formData: VentureConnectFormData = {
  fullName: "Dr. Amara <Okonkwo>",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Biomedical Engineering",
  currentRole: "phd_student",
  graduationTimeline: "within_two_years",
  institutionEmail: "amara@example.org",
  linkedinUrl: "https://www.linkedin.com/in/amara-okonkwo/",
  companyName: "PuriBio & Partners",
  companyRole: "Co-founder & CEO",
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
  eventWebsite: "https://www.bio.org/conferences/bio-international-convention",
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
    "Within 2 years of graduation",
    "https://www.linkedin.com/in/amara-okonkwo/",
    "PuriBio & Partners",
    "Co-founder & CEO",
    "A faster downstream purification platform.",
    "Invention disclosure",
    "Provisional patent",
    "Meet investors and prospective manufacturing partners.",
    "Industry / Investor Conference",
    "BIO International Convention",
    "June 22-25, 2027",
    "https://www.bio.org/conferences/bio-international-convention",
    "$4,475.00 CAD",
    "Business pitch deck",
    "Travel & accommodation cost estimates",
    "Amara Okonkwo",
  ]) {
    assert.ok(email.text.includes(detail), `${detail} missing from text receipt`);
    assert.ok(email.html.includes(detail.replace(/&/g, "&amp;")), `${detail} missing from HTML receipt`);
  }
});

test("uploaded file metadata cannot leak into the applicant-facing email body", () => {
  const data = {
    ...formData,
    documents: [{ name: "secret-pitch-deck.pdf", url: "https://files.example/secret" }],
  } as VentureConnectFormData;
  const email = receipt(data);
  assert.ok(!email.text.includes("secret-pitch-deck.pdf"));
  assert.ok(!email.html.includes("secret-pitch-deck.pdf"));
  assert.ok(!email.text.includes("https://files.example/secret"));
  assert.ok(!email.html.includes("https://files.example/secret"));
  assert.match(email.text, /complete application packet is attached as one PDF/i);
  assert.match(email.html, /complete application packet is attached as one PDF/i);
});

test("submission copies stay hidden from the applicant", () => {
  // EQUIP's own inbox, not ENGAGE's — the two tracks have different
  // teams and VentureConnect belongs to EQUIP.
  assert.deepEqual(VENTURE_CONNECT_SUBMISSION_BCC, [
    "info@biohubnet.ca",
    "equip@biohubnet.ca",
  ]);
  const email = receipt();
  /*
   * info@ is a silent internal copy and must never appear in the body —
   * that is the property this test protects: the applicant should not
   * be able to tell a copy went anywhere.
   *
   * equip@ is the exception, on purpose: it is BOTH the hidden BCC
   * recipient AND the support address the receipt already prints in its
   * "Questions?" footer (see renderText/renderHtml). Asserting it is
   * absent would fail against the correct, intended email — the
   * applicant is meant to see equip@ as a contact address; they are
   * just not meant to know it also received a silent copy.
   */
  assert.ok(!email.text.includes("info@biohubnet.ca"));
  assert.ok(!email.html.includes("info@biohubnet.ca"));
  assert.ok(email.text.includes("equip@biohubnet.ca"));
  assert.ok(email.html.includes("equip@biohubnet.ca"));
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

test("LinkedIn and Event Website read as 'Not provided' when left blank, not omitted", () => {
  const email = receipt({ ...formData, linkedinUrl: undefined, eventWebsite: undefined });
  assert.match(email.text, /LinkedIn profile:\nNot provided/);
  assert.match(email.text, /Event website:\nNot provided/);
});
