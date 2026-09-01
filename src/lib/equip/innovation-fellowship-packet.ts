import {
  buildEquipApplicationPacket,
  type EquipApplicationPacket,
  type EquipDocumentLoader,
} from "./venture-connect-packet";
import { innovationFellowshipReceiptSections } from "./innovation-fellowship-receipt";
import type { EquipDocument, InnovationFellowshipFormData } from "./types";

export interface InnovationFellowshipPacketInput {
  applicationId: string;
  submittedAt: Date;
  formData: InnovationFellowshipFormData;
  documents: EquipDocument[];
}

export async function buildInnovationFellowshipApplicationPacket(
  input: InnovationFellowshipPacketInput,
  loadDocument?: EquipDocumentLoader,
): Promise<EquipApplicationPacket> {
  return buildEquipApplicationPacket({
    applicationId: input.applicationId,
    submittedAt: input.submittedAt,
    applicantName: input.formData.fullName,
    title: "Innovation Fellowship application",
    subject: "Submitted EQUIP Innovation Fellowship application and supporting files",
    filenamePrefix: "EQUIP-Innovation-Fellowship",
    sections: innovationFellowshipReceiptSections(input.formData),
    documents: input.documents,
  }, loadDocument);
}
