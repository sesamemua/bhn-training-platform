import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { R2_BUCKET, r2 } from "@/lib/r2";
import { receiptSections } from "./venture-connect-receipt";
import type { EquipDocument, VentureConnectFormData } from "./types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = 54;
const BRAND = rgb(0.043, 0.333, 0.4);
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.278, 0.333, 0.412);
const LINE = rgb(0.886, 0.91, 0.941);

export interface VentureConnectPacketInput {
  applicationId: string;
  submittedAt: Date;
  formData: VentureConnectFormData;
  documents: EquipDocument[];
}

export interface VentureConnectPacket {
  filename: string;
  content: Buffer;
  contentType: "application/pdf";
  includedFiles: string[];
}

export type EquipDocumentLoader = (document: EquipDocument) => Promise<Uint8Array>;

async function loadR2Document(document: EquipDocument): Promise<Uint8Array> {
  if (!r2) throw new Error("R2 is not configured for VentureConnect packet generation.");
  const response = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: document.key }));
  if (!response.Body) throw new Error(`Uploaded file is empty: ${document.name}`);

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024)).toLocaleString("en-CA")} KB`;
  return `${(value / 1024 / 1024).toLocaleString("en-CA", { maximumFractionDigits: 1 })} MB`;
}

function safeFilename(value: string, fallback: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);
  return cleaned || fallback;
}

function extension(document: EquipDocument): string {
  return document.name.split(".").pop()?.toLowerCase() ?? "";
}

function documentFormat(document: EquipDocument): "pdf" | "jpg" | "png" | "embedded" {
  const contentType = document.contentType.toLowerCase().split(";")[0];
  const ext = extension(document);
  if (contentType === "application/pdf" || ext === "pdf") return "pdf";
  if (contentType === "image/jpeg" || ext === "jpg" || ext === "jpeg") return "jpg";
  if (contentType === "image/png" || ext === "png") return "png";
  return "embedded";
}

function supportedText(font: PDFFont, value: string): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(value.replace(/\r/g, "")).map((character) => {
    const codePoint = character.codePointAt(0) ?? 63;
    return supported.has(codePoint) ? character : "?";
  }).join("");
}

function wrapText(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const safe = supportedText(font, value);
  const lines: string[] = [];

  for (const paragraph of safe.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }

      let fragment = "";
      for (const character of word) {
        const next = fragment + character;
        if (font.widthOfTextAtSize(next, size) > maxWidth && fragment) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment = next;
        }
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [""];
}

class PacketWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - 93;
  }

  private newPage(): PDFPage {
    const page = this.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText("BIOHUBNET  |  EQUIP", {
      x: MARGIN,
      y: PAGE_HEIGHT - 52,
      size: 9,
      font: this.bold,
      color: BRAND,
    });
    page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - 64 },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 64 },
      thickness: 0.8,
      color: LINE,
    });
    return page;
  }

  private nextPage(): void {
    this.page = this.newPage();
    this.y = PAGE_HEIGHT - 93;
  }

  private ensureSpace(points: number): void {
    if (this.y - points < BOTTOM) this.nextPage();
  }

  paragraph(
    value: string,
    options: {
      font?: PDFFont;
      size?: number;
      lineHeight?: number;
      color?: RGB;
      spaceAfter?: number;
    } = {},
  ): void {
    const font = options.font ?? this.regular;
    const size = options.size ?? 10.5;
    const lineHeight = options.lineHeight ?? 15;
    const color = options.color ?? INK;
    const lines = wrapText(font, value, size, CONTENT_WIDTH);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      if (line) {
        this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color });
      }
      this.y -= lineHeight;
    }
    this.y -= options.spaceAfter ?? 8;
  }

  title(value: string): void {
    this.paragraph(value, { font: this.bold, size: 23, lineHeight: 28, spaceAfter: 14 });
  }

  section(value: string): void {
    this.ensureSpace(40);
    this.y -= 8;
    this.paragraph(value, { font: this.bold, size: 14, lineHeight: 18, color: BRAND, spaceAfter: 8 });
  }

  row(label: string, value: string): void {
    this.ensureSpace(38);
    this.paragraph(label, { font: this.bold, size: 9, lineHeight: 12, color: MUTED, spaceAfter: 2 });
    this.paragraph(value, { size: 10.5, lineHeight: 15, spaceAfter: 8 });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 4 },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y + 4 },
      thickness: 0.5,
      color: LINE,
    });
  }

  attachmentCover(document: EquipDocument, index: number, total: number, embeddedOnly: boolean): void {
    this.nextPage();
    this.paragraph(`ATTACHMENT ${index} OF ${total}`, {
      font: this.bold,
      size: 10,
      lineHeight: 14,
      color: BRAND,
      spaceAfter: 12,
    });
    this.title(document.name);
    this.row("File format", document.contentType || extension(document).toUpperCase() || "Unknown");
    this.row("File size", formatBytes(document.size));
    if (embeddedOnly) {
      this.paragraph(
        "The original Word or Excel file is embedded inside this PDF. Open the packet in Adobe Acrobat and use the Attachments panel to open the original file.",
        { color: MUTED, spaceAfter: 0 },
      );
    } else {
      this.paragraph("The uploaded file appears on the pages immediately following this cover sheet.", {
        color: MUTED,
        spaceAfter: 0,
      });
    }
  }

  attachmentFallback(name: string): void {
    this.paragraph(
      `The original ${name} is embedded inside this PDF because its pages could not be rendered safely. Open the packet in Adobe Acrobat and use the Attachments panel to open the original file.`,
      { color: MUTED, spaceAfter: 0 },
    );
  }
}

function drawImagePage(document: PDFDocument, image: PDFImage, name: string, font: PDFFont): void {
  const landscape = image.width > image.height;
  const width = landscape ? PAGE_HEIGHT : PAGE_WIDTH;
  const height = landscape ? PAGE_WIDTH : PAGE_HEIGHT;
  const page = document.addPage([width, height]);
  const margin = 42;
  const labelHeight = 30;
  const scale = Math.min(
    (width - margin * 2) / image.width,
    (height - margin * 2 - labelHeight) / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;

  page.drawText(supportedText(font, name), {
    x: margin,
    y: height - margin,
    size: 9,
    font,
    color: MUTED,
  });
  page.drawImage(image, {
    x: (width - renderedWidth) / 2,
    y: (height - labelHeight - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  });
}

async function embedOriginal(
  document: PDFDocument,
  attachment: EquipDocument,
  bytes: Uint8Array,
  index: number,
): Promise<void> {
  await document.attach(bytes, `${String(index).padStart(2, "0")}-${safeFilename(attachment.name, "attachment")}`, {
    mimeType: attachment.contentType || "application/octet-stream",
    description: `Original VentureConnect supporting file: ${attachment.name}`,
    creationDate: new Date(attachment.uploadedAt),
    modificationDate: new Date(attachment.uploadedAt),
  });
}

export async function buildVentureConnectApplicationPacket(
  input: VentureConnectPacketInput,
  loadDocument: EquipDocumentLoader = loadR2Document,
): Promise<VentureConnectPacket> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(`VentureConnect application - ${input.formData.fullName || input.applicationId}`);
  document.setAuthor("BioHubNet EQUIP");
  document.setSubject("Submitted VentureConnect application and supporting files");
  document.setCreator("BioHubNet Training Platform");
  document.setProducer("BioHubNet Training Platform");
  document.setCreationDate(input.submittedAt);
  document.setModificationDate(input.submittedAt);

  const writer = new PacketWriter(document, regular, bold);
  writer.title("VentureConnect application");
  writer.row("Applicant", input.formData.fullName?.trim() || "Not provided");
  writer.row("Application reference", input.applicationId);
  writer.row("Submitted", formatSubmittedAt(input.submittedAt));

  for (const section of receiptSections(input.formData)) {
    writer.section(section.heading);
    for (const row of section.rows) writer.row(row.label, row.value);
  }

  writer.section("Included supporting files");
  if (input.documents.length === 0) {
    writer.paragraph("No supporting files were uploaded.", { color: MUTED });
  } else {
    input.documents.forEach((attachment, index) => {
      writer.row(
        `${index + 1}. ${attachment.name}`,
        `${attachment.contentType || "Unknown format"} - ${formatBytes(attachment.size)}`,
      );
    });
    writer.paragraph(
      "PDF and image uploads appear as pages below. Word and Excel originals are embedded inside this PDF and are listed on their own attachment cover pages.",
      { color: MUTED },
    );
  }

  for (const [index, attachment] of input.documents.entries()) {
    const bytes = await loadDocument(attachment);
    const format = documentFormat(attachment);
    writer.attachmentCover(attachment, index + 1, input.documents.length, format === "embedded");

    if (format === "pdf") {
      try {
        const source = await PDFDocument.load(bytes, { updateMetadata: false });
        if (source.getPageCount() === 0) throw new Error("PDF has no pages");
        const pages = await document.copyPages(source, source.getPageIndices());
        pages.forEach((page) => document.addPage(page));
      } catch {
        await embedOriginal(document, attachment, bytes, index + 1);
        writer.attachmentFallback(attachment.name);
      }
      continue;
    }

    if (format === "jpg" || format === "png") {
      try {
        const image = format === "jpg"
          ? await document.embedJpg(bytes)
          : await document.embedPng(bytes);
        drawImagePage(document, image, attachment.name, regular);
      } catch {
        await embedOriginal(document, attachment, bytes, index + 1);
        writer.attachmentFallback(attachment.name);
      }
      continue;
    }

    await embedOriginal(document, attachment, bytes, index + 1);
  }

  const bytes = await document.save({ useObjectStreams: true });
  const applicant = safeFilename(input.formData.fullName || "Applicant", "Applicant");
  const reference = safeFilename(input.applicationId.slice(-12), "application");
  return {
    filename: `VentureConnect-${applicant}-${reference}.pdf`,
    content: Buffer.from(bytes),
    contentType: "application/pdf",
    includedFiles: input.documents.map((attachment) => attachment.name),
  };
}
