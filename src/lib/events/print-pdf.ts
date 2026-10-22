import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import { PDFDocument, degrees } from "pdf-lib";
import type { PrintBoard, PrintJob } from "./print-jobs";

// Avery 5393: Letter, two columns of 4 x 3 inches; 1-inch top and 1/4-inch side margins.
export const AVERY_5393 = { width: 288, height: 216, left: 18, top: 72, perSheet: 6, pageWidth: 612, pageHeight: 792 };
export function badgePosition(index: number, job: Pick<PrintJob, "skip" | "offsetX" | "offsetY">) {
  const position = index + job.skip;
  return { page: Math.floor(position / 6), x: 18 + position % 2 * 288 + job.offsetX * 72 / 25.4, y: 72 + Math.floor(position % 6 / 2) * 216 + job.offsetY * 72 / 25.4 };
}

async function document() {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const [font, logo] = await Promise.all([
    readFile(path.join(process.cwd(), "public/print/NotoSans-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/biohubnet-logo.png")),
  ]);
  doc.addFileToVFS("NotoSans.ttf", font.toString("base64"));
  doc.addFont("NotoSans.ttf", "NotoSans", "normal");
  doc.setFont("NotoSans"); doc.setTextColor(25, 34, 40);
  return { doc, logo: `data:image/png;base64,${logo.toString("base64")}` };
}

function fitted(doc: jsPDF, value: string, x: number, y: number, width: number, height: number, largest: number, smallest: number) {
  if (!value) return;
  for (let size = largest; size >= smallest; size--) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, width) as string[];
    if (lines.length * size * 1.18 <= height) {
      doc.text(lines, x + width / 2, y, { align: "center", baseline: "top", lineHeightFactor: 1.18 });
      return;
    }
  }
  throw new Error(`This badge line is too long to print legibly: ${value.slice(0, 65)}. Shorten it before creating the batch.`);
}

export async function buildPrintPdf(job: PrintJob, board: PrintBoard, template?: Uint8Array): Promise<Uint8Array> {
  if (template && ((job.kind === "tents" && !job.tentStyle) || job.kind === "agenda")) {
    const source = await PDFDocument.load(template), output = await PDFDocument.create();
    // Valid blank separator pages also need a content stream before embedding.
    for (const page of source.getPages()) page.drawRectangle({ x: 0, y: 0, width: 0, height: 0, opacity: 0 });
    const pages = await output.embedPages(source.getPages());
    for (let copy = 0; copy < job.copies; copy++) for (const embedded of pages) {
      const page = output.addPage([612, 792]);
      const scale = Math.min(612 / embedded.width, 792 / embedded.height);
      page.drawPage(embedded, { x: (612 - embedded.width * scale) / 2, y: (792 - embedded.height * scale) / 2, width: embedded.width * scale, height: embedded.height * scale });
    }
    return output.save();
  }
  const { doc, logo } = await document();
  doc.setProperties({ title: job.label, author: "BioHubNet", subject: `2026 Annual Symposium - ${job.kind}` });
  if (job.kind === "badges") {
    for (const [index, badge] of job.badges.entries()) {
      const pos = badgePosition(index, job);
      while (doc.getNumberOfPages() <= pos.page) doc.addPage();
      doc.setPage(pos.page + 1);
      const { x, y } = pos;
      const properties = doc.getImageProperties(logo);
      doc.addImage(logo, "PNG", x + 96, y + 14, 96, 96 * properties.height / properties.width);
      doc.setTextColor(25, 34, 40);
      // Name, then the position just above the organization, then the organization.
      fitted(doc, badge.name, x + 16, y + 58, 256, 62, 28, 16);
      doc.setTextColor(60, 74, 80);
      if (badge.position) fitted(doc, badge.position, x + 18, y + 122, 252, 18, 11, 8);
      fitted(doc, badge.organization, x + 18, y + (badge.position ? 142 : 135), 252, badge.position ? 32 : 37, 13, 9);
      doc.setTextColor(36, 100, 108);
      fitted(doc, badge.extra, x + 18, y + 178, 252, 24, 12, 9);
      doc.setFontSize(7); doc.setTextColor(70, 80, 86);
      doc.text("2026 Annual Symposium", x + 144, y + 209, { align: "center" });
    }
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page); doc.setFontSize(7); doc.setTextColor(90);
      doc.text(`Avery 5393 | Letter | Actual size 100% | ${job.label} | ${page}/${doc.getNumberOfPages()}`, 18, 772);
    }
  } else if (job.kind === "tents") {
    const title = job.tentStyle ? (job.tentStyle === "table-reserved" ? "TABLE\nRESERVED" : "SEAT\nRESERVED") : board.tentText || "BioHubNet\n2026 Annual Symposium";
    const properties = doc.getImageProperties(logo);
    doc.addImage(logo, "PNG", 216, 440, 180, 180 * properties.height / properties.width);
    doc.setTextColor(25, 34, 40);
    fitted(doc, title, 54, 535, 504, 180, job.tentStyle ? 48 : 38, job.tentStyle ? 32 : 18);
    if (job.tentStyle) { doc.setFontSize(11); doc.setTextColor(60, 74, 80); doc.text("2026 Annual Symposium", 306, 750, { align: "center" }); }
    doc.setDrawColor(180); doc.setLineDashPattern([3, 4], 0); doc.line(18, 396, 594, 396);
    const output = await PDFDocument.create();
    const [face] = await output.embedPdf(doc.output("arraybuffer"));
    for (let copy = 0; copy < job.copies; copy++) {
      const sheet = output.addPage([612, 792]);
      sheet.drawPage(face);
      sheet.drawPage(face, { x: 612, y: 792, rotate: degrees(180) });
    }
    return output.save();
  } else if (job.kind === "signage") {
    if (!job.signage) throw new Error("Choose a signage event.");
    const sign = job.signage;
    for (let copy = 0; copy < job.copies; copy++) {
      if (copy) doc.addPage();
      doc.addImage(logo, "PNG", 196, 48, 220, 220 * doc.getImageProperties(logo).height / doc.getImageProperties(logo).width);
      doc.setTextColor(36, 100, 108);
      fitted(doc, "TRAINING WEEK 2026", 48, 145, 516, 28, 17, 17);
      doc.setTextColor(25, 34, 40);
      if (sign.sessions) {
        sign.sessions.forEach((session, index) => {
          fitted(doc, session.title, 48, 205 + index * 152, 516, 80, 34, 30);
          if (session.facilitator) fitted(doc, `Host: ${session.facilitator}`, 48, 295 + index * 152, 516, 28, 20, 18);
        });
        doc.setDrawColor(180); doc.setLineWidth(0.5); doc.line(132, 337, 480, 337);
        doc.setDrawColor(36, 100, 108); doc.setLineWidth(1); doc.line(240, 493, 372, 493);
        fitted(doc, sign.date, 48, 517, 516, 35, 22, 18);
        fitted(doc, sign.time, 48, 563, 516, 40, 26, 22);
        doc.setTextColor(60, 74, 80);
        fitted(doc, sign.venue, 60, 641, 492, 70, 23, 18);
        continue;
      }
      fitted(doc, sign.title, 48, 225, 516, 160, 46, 32);
      if (sign.facilitator) fitted(doc, sign.facilitator, 48, 390, 516, 30, 22, 18);
      doc.setDrawColor(36, 100, 108); doc.setLineWidth(2); doc.line(240, 453, 372, 453);
      fitted(doc, sign.date, 48, 484, 516, 38, 23, 18);
      fitted(doc, sign.time, 48, 533, 516, 40, 28, 22);
      doc.setTextColor(60, 74, 80);
      fitted(doc, sign.venue, 60, 613, 492, 125, 23, 18);
    }
  } else {
    for (let copy = 0; copy < job.copies; copy++) {
      if (copy) doc.addPage();
      const heading = () => {
        doc.addImage(logo, "PNG", 48, 30, 125, 125 * doc.getImageProperties(logo).height / doc.getImageProperties(logo).width);
        doc.setFontSize(22); doc.setTextColor(25, 34, 40); doc.text("2026 Annual Symposium", 48, 103);
        doc.setFontSize(11); doc.text("Thursday, October 29, 2026 | All times Eastern", 48, 126);
        doc.setDrawColor(190); doc.line(48, 143, 564, 143);
      };
      heading(); let y = 166;
      doc.setFontSize(11);
      for (const paragraph of board.agendaText.split("\n")) {
        const lines = doc.splitTextToSize(paragraph || " ", 516) as string[];
        for (const line of lines) {
          if (y > 738) { doc.addPage(); heading(); doc.setFontSize(11); y = 166; }
          doc.text(line, 48, y); y += 16;
        }
        y += 4;
      }
    }
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
