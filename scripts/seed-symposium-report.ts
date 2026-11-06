import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { REPORT_ID, REPORT_PATH, REPORT_TITLE, reportAssetTypes, reportSchema } from "../src/lib/symposium-report/document";

async function seed() {
  const directory = process.argv[2];
  if (!directory) throw new Error("Pass the directory containing draft.json and assets/.");
  const draft = reportSchema.parse(JSON.parse(await readFile(join(directory, "draft.json"), "utf8")));
  const assets = await Promise.all(Object.keys(reportAssetTypes).map(async (name) => {
    const content = await readFile(join(directory, "assets", name));
    if (!content.length || content.length > 2_000_000) throw new Error(`Unexpected asset size: ${name}`);
    return { name, content };
  }));
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction([
      prisma.symposiumReportAsset.createMany({ data: assets, skipDuplicates: true }),
      prisma.pageReview.createMany({
        data: { id: REPORT_ID, url: REPORT_PATH, kind: "report", title: REPORT_TITLE, pastedHtml: JSON.stringify(draft) },
        skipDuplicates: true,
      }),
    ]);
    console.log(result[1].count ? "Created the private Round 1 report." : "Existing report kept intact.");
    console.log(`Installed ${result[0].count} artwork files.`);
  } finally { await prisma.$disconnect(); }
}

void seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Report setup failed.");
  process.exitCode = 1;
});
