/**
 * One-off: replace the Training Week chart with the 2026-note version.
 *
 * The chart may carry hand edits, so the old document is written to
 * backups/flowcharts/ FIRST — restoring is pasting that file back.
 *
 * Run: npx tsx scripts/apply-2026-note.ts
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { TRAINING_WEEK_FLOW } from "../src/lib/flowchart/seed";

const prisma = new PrismaClient();

async function main() {
  const chart = await prisma.flowChart.findFirst({
    where: { title: { contains: "Training Week" } },
  });
  if (!chart) throw new Error("No Training Week chart found.");

  const stamp = new Date().toISOString().slice(0, 10);
  const file = `backups/flowcharts/${stamp}-${chart.id}-training-week.json`;
  writeFileSync(file, JSON.stringify(chart, null, 2));
  console.log(`Backed up the current chart to ${file}`);

  await prisma.flowChart.update({
    where: { id: chart.id },
    data: { data: TRAINING_WEEK_FLOW },
  });
  console.log(`Replaced "${chart.title}" (${chart.id}) with the 2026-note flow.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
