import { prisma } from "@/lib/prisma";
import { catalogueSchema, REPORT_GALLERY_KEY } from "./gallery";

export async function readReportGallery() {
  const row = await prisma.symposiumReportAsset.findUnique({ where: { name: REPORT_GALLERY_KEY } });
  return row ? catalogueSchema.parse(JSON.parse(Buffer.from(row.content).toString("utf8"))) : { groups: [], defaults: {} };
}
