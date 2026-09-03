import test from "node:test";
import assert from "node:assert/strict";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { buildVentureConnectApplicationPacket } from "../../src/lib/equip/venture-connect-packet";
import type { EquipDocument, VentureConnectFormData } from "../../src/lib/equip/types";

const formData: VentureConnectFormData = {
  fullName: "Amara Okonkwo",
  institutionAffiliation: "University of Toronto",
  departmentProgram: "Biomedical Engineering",
  currentRole: "phd_student",
  graduationTimeline: "within_two_years",
  institutionEmail: "amara@example.org",
  companyName: "PuriBio",
  companyWebsite: "https://example.org",
  hasBiomanufacturingOrHumanHealthApplication: true,
  ventureDescription: "A faster downstream purification platform for biologics manufacturing.",
  ip: {
    inventionDisclosureChecked: true,
    inventionDisclosureDate: "2026-05-01",
  },
  fundingJustification: "Meet investors and prospective manufacturing partners at the event.",
  eventCategory: "conference",
  eventName: "BIO International Convention",
  eventLocation: "San Diego, California",
  eventDates: "June 22-25, 2027",
  supportingDocs: ["pitch_deck"],
  budgetAirfare: 1200,
  budgetRegistration: 1500,
  acknowledged: true,
  signaturePrintedName: "Amara Okonkwo",
  signatureDate: "2026-08-31",
};

function equipDocument(name: string, contentType: string, size: number): EquipDocument {
  return {
    key: `equip/app/other/${name}`,
    name,
    size,
    contentType,
    kind: "other",
    uploadedAt: "2026-08-31T20:15:00.000Z",
  };
}

async function sourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  return document.save();
}

const packetInput = {
  applicationId: "vc-reference-123",
  submittedAt: new Date("2026-08-31T20:15:00.000Z"),
  formData,
};

test("the packet contains the form plus every uploaded PDF page", async () => {
  const empty = await buildVentureConnectApplicationPacket(
    { ...packetInput, documents: [] },
    async () => new Uint8Array(),
  );
  const pdfAttachment = equipDocument("pitch-deck.pdf", "application/pdf", 2048);
  const withAttachment = await buildVentureConnectApplicationPacket(
    { ...packetInput, documents: [pdfAttachment] },
    async () => sourcePdf(),
  );

  const emptyPdf = await PDFDocument.load(empty.content);
  const combinedPdf = await PDFDocument.load(withAttachment.content);
  assert.equal(combinedPdf.getPageCount(), emptyPdf.getPageCount() + 3);
  assert.deepEqual(withAttachment.includedFiles, ["pitch-deck.pdf"]);
  assert.match(withAttachment.filename, /^VentureConnect-Amara-Okonkwo-.+\.pdf$/);
  assert.equal(withAttachment.contentType, "application/pdf");
});

test("Word and Excel originals are embedded inside the single PDF", async () => {
  const word = equipDocument(
    "recommendation.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    128,
  );
  const packet = await buildVentureConnectApplicationPacket(
    { ...packetInput, documents: [word] },
    async () => Buffer.from("original-office-file"),
  );
  const combinedPdf = await PDFDocument.load(packet.content);
  const names = combinedPdf.catalog.lookup(PDFName.of("Names"), PDFDict);
  const embeddedFiles = names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);

  assert.ok(embeddedFiles, "the PDF should have an embedded-files name tree");
  assert.deepEqual(packet.includedFiles, ["recommendation.docx"]);
});
