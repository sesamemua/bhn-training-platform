import type { EquipDocument } from "./types";

export const MAX_PUBLIC_EQUIP_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_PUBLIC_EQUIP_DOCUMENTS = 12;
export const MAX_PUBLIC_EQUIP_TOTAL_BYTES = 100 * 1024 * 1024;

export const PUBLIC_EQUIP_DOCUMENT_RULES = {
  pitch_deck: {
    extensions: ["pdf"],
    contentTypes: ["application/pdf"],
  },
  prototype_photo: {
    extensions: ["jpg", "jpeg", "png"],
    contentTypes: ["image/jpeg", "image/png"],
  },
  letter: {
    extensions: ["pdf", "doc", "docx"],
    contentTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  video_pitch: {
    extensions: ["mp4"],
    contentTypes: ["video/mp4"],
  },
} as const;

export type PublicEquipDocumentKind = keyof typeof PUBLIC_EQUIP_DOCUMENT_RULES;

export function validatePublicEquipDocumentUpload({
  kind,
  name,
  size,
  contentType,
  existingDocuments,
}: {
  kind: string;
  name: string;
  size: number;
  contentType: string;
  existingDocuments: EquipDocument[];
}): string | null {
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_EQUIP_DOCUMENT_RULES, kind)) {
    return "Choose a valid attachment type.";
  }
  if (size <= 0) return "The selected file is empty.";
  if (size > MAX_PUBLIC_EQUIP_DOCUMENT_BYTES) return "File too large - maximum 25 MB.";
  if (existingDocuments.length >= MAX_PUBLIC_EQUIP_DOCUMENTS) {
    return `This application already has ${MAX_PUBLIC_EQUIP_DOCUMENTS} attachments.`;
  }
  const existingBytes = existingDocuments.reduce((total, document) => total + document.size, 0);
  if (existingBytes + size > MAX_PUBLIC_EQUIP_TOTAL_BYTES) {
    return "Attachments for one application cannot exceed 100 MB in total.";
  }

  const rule = PUBLIC_EQUIP_DOCUMENT_RULES[kind as PublicEquipDocumentKind];
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!(rule.extensions as readonly string[]).includes(extension)) {
    return "That file format is not allowed for this attachment type.";
  }
  if (contentType && !(rule.contentTypes as readonly string[]).includes(contentType.toLowerCase())) {
    return "That file format is not allowed for this attachment type.";
  }
  return null;
}
