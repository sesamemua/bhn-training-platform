import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PUBLIC_EQUIP_DOCUMENT_BYTES,
  MAX_PUBLIC_EQUIP_DOCUMENTS,
  validatePublicEquipDocumentUpload,
} from "../../src/lib/equip/public-document-upload";
import type { EquipDocument } from "../../src/lib/equip/types";

const upload = (overrides: Partial<Parameters<typeof validatePublicEquipDocumentUpload>[0]> = {}) =>
  validatePublicEquipDocumentUpload({
    kind: "pitch_deck",
    name: "deck.pdf",
    size: 1024,
    contentType: "application/pdf",
    existingDocuments: [],
    ...overrides,
  });

test("public EQUIP uploads accept the intended document formats", () => {
  assert.equal(upload(), null);
  assert.equal(upload({ kind: "prototype_photo", name: "prototype.png", contentType: "image/png" }), null);
  assert.equal(upload({ kind: "letter", name: "letter.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), null);
  assert.equal(upload({ kind: "video_pitch", name: "pitch.mp4", contentType: "video/mp4" }), null);
});

test("public EQUIP uploads reject mismatched and oversized files", () => {
  assert.match(upload({ kind: "toString" }) ?? "", /valid attachment type/);
  assert.match(upload({ name: "page.html", contentType: "text/html" }) ?? "", /not allowed/);
  assert.match(upload({ size: MAX_PUBLIC_EQUIP_DOCUMENT_BYTES + 1 }) ?? "", /25 MB/);
});

test("public EQUIP uploads cap file count and aggregate storage", () => {
  const document: EquipDocument = {
    key: "equip/app/pitch/file.pdf",
    name: "file.pdf",
    size: 1024,
    contentType: "application/pdf",
    kind: "pitch_deck",
    uploadedAt: "2026-08-31T00:00:00.000Z",
  };
  assert.match(
    upload({ existingDocuments: Array.from({ length: MAX_PUBLIC_EQUIP_DOCUMENTS }, () => document) }) ?? "",
    /already has/,
  );
  assert.match(
    upload({ existingDocuments: [{ ...document, size: 100 * 1024 * 1024 }] }) ?? "",
    /100 MB/,
  );
});
