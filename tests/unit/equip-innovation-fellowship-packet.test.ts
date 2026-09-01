import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildInnovationFellowshipApplicationPacket } from "../../src/lib/equip/innovation-fellowship-packet";
import type { EquipDocument, InnovationFellowshipFormData } from "../../src/lib/equip/types";

const formData: InnovationFellowshipFormData = {
  opportunity: "trainee_fellowship_postdoc",
  fullName: "Amara Okonkwo",
  institutionEmail: "amara@example.org",
  ventureName: "PuriBio",
  fellowshipMilestones: [],
};

test("the Innovation Fellowship packet includes uploaded PDF pages", async () => {
  const source = await PDFDocument.create();
  source.addPage();
  source.addPage();
  const attachmentBytes = await source.save();
  const attachment: EquipDocument = {
    key: "equip/if/supporting.pdf",
    name: "supporting.pdf",
    size: attachmentBytes.length,
    contentType: "application/pdf",
    kind: "other",
    uploadedAt: "2026-08-31T20:15:00.000Z",
  };

  const withoutAttachment = await buildInnovationFellowshipApplicationPacket({
    applicationId: "if-reference-123",
    submittedAt: new Date("2026-08-31T20:15:00.000Z"),
    formData,
    documents: [],
  }, async () => new Uint8Array());
  const withAttachment = await buildInnovationFellowshipApplicationPacket({
    applicationId: "if-reference-123",
    submittedAt: new Date("2026-08-31T20:15:00.000Z"),
    formData,
    documents: [attachment],
  }, async () => attachmentBytes);

  const base = await PDFDocument.load(withoutAttachment.content);
  const combined = await PDFDocument.load(withAttachment.content);
  assert.equal(combined.getPageCount(), base.getPageCount() + 3);
  assert.match(withAttachment.filename, /^EQUIP-Innovation-Fellowship-Amara-Okonkwo-.+\.pdf$/);
  assert.deepEqual(withAttachment.includedFiles, ["supporting.pdf"]);
});
