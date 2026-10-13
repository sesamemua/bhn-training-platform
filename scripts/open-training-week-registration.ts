import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG_V2, refuseFrozenForm } from "../src/lib/allocation/symposium-2026";
import { openTrainingWeekRegistration, OPEN_TRAINING_WEEK_COPY } from "../src/lib/formbuilder/training-week-open-registration";

const prisma = new PrismaClient();
async function main() {
  const row = await prisma.eventForm.findUniqueOrThrow({ where: { slug: REGISTRATION_FORM_SLUG_V2 } });
  refuseFrozenForm(row.slug, "open-training-week-registration");
  const fields = openTrainingWeekRegistration(row.slug, row.fields);
  const unchanged = JSON.stringify(fields) === JSON.stringify(row.fields) && row.description === OPEN_TRAINING_WEEK_COPY;
  console.log(JSON.stringify({ slug: row.slug, unchanged, options: fields.fields.find((f) => f.key === "bhn_status")?.options,
    removedNotes: ["need_programme_note", "need_account_note"], submissionsModified: false }));
  if (unchanged || !process.argv.includes("--apply")) return;
  mkdirSync("backups/forms", { recursive: true });
  const backup = `backups/forms/${Date.now()}-before-open-training-week.json`;
  writeFileSync(backup, JSON.stringify(row, null, 2), { mode: 0o600 });
  const result = await prisma.eventForm.updateMany({
    where: { id: row.id, updatedAt: row.updatedAt, fields: { equals: row.fields! } },
    data: { fields: fields as object, description: OPEN_TRAINING_WEEK_COPY },
  });
  if (result.count !== 1) throw new Error("The form changed concurrently. No changes applied; rerun after reviewing it.");
  const saved = await prisma.eventForm.findUniqueOrThrow({ where: { id: row.id } });
  if (JSON.stringify(openTrainingWeekRegistration(saved.slug, saved.fields)) !== JSON.stringify(saved.fields)) throw new Error("Read-back verification failed.");
  console.log(`Applied and verified. Backup: ${backup}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Update failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
