import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { catalogueSchema, REPORT_GALLERY_KEY } from "../src/lib/symposium-report/gallery";

async function importPhotos() {
  const directory = process.argv[2];
  if (!directory) throw new Error("Provide the private gallery directory.");
  const catalogue = catalogueSchema.parse(JSON.parse(await readFile(join(directory, "gallery.json"), "utf8")));
  const files = [...new Set(catalogue.groups.flatMap((group) => group.photos.map(({ file }) => file)))];
  if (!files.length || files.length > 450) throw new Error("Check the final photo inventory.");
  if (Object.values(catalogue.defaults).flat().some(({ file }) => !files.includes(file))) throw new Error("A recommended photo is missing from the catalogue.");
  const assets = await Promise.all(files.map(async (name) => {
    const content = await readFile(join(directory, "assets", name));
    if (content.length > 500_000 || content.toString("ascii", 8, 12) !== "WEBP") throw new Error("Expected an optimized WebP photo.");
    return { name, content: new Uint8Array(content) };
  }));
  const bytes = assets.reduce((size, asset) => size + asset.content.length, 0);
  if (bytes > 65_000_000) throw new Error("The optimized photo package exceeds the storage budget.");

  const prisma = new PrismaClient();
  try {
    for (let i = 0; i < assets.length; i += 24) {
      await prisma.symposiumReportAsset.createMany({ data: assets.slice(i, i + 24), skipDuplicates: true });
    }
    const content = new Uint8Array(Buffer.from(JSON.stringify(catalogue)));
    await prisma.symposiumReportAsset.upsert({
      where: { name: REPORT_GALLERY_KEY },
      create: { name: REPORT_GALLERY_KEY, content },
      update: { content },
    });
    console.log(`Verified ${files.length} private gallery photos (${bytes} bytes).`);
  } finally { await prisma.$disconnect(); }
}

void importPhotos().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Gallery import failed.");
  process.exitCode = 1;
});
