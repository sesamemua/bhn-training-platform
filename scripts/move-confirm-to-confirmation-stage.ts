/**
 * Move the "Can you still make it?" question out of the registration
 * form and into the after-approval stage.
 *
 * Surgical on purpose: it touches ONE property of ONE field and leaves
 * every other edit alone. A re-seed would have done the job in one line
 * and taken the coordinator's deleted questions with it — which is
 * exactly what happened once already.
 *
 * Re-runnable. Backs up before writing.
 *
 * Run: npx tsx scripts/move-confirm-to-confirmation-stage.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseForm } from "../src/lib/formbuilder/types";

const prisma = new PrismaClient();

async function main() {
  const forms = await prisma.eventForm.findMany();
  let changed = 0;

  for (const row of forms) {
    const doc = parseForm(row.fields);
    const target = doc.fields.find((f) => f.key === "confirmed");
    if (!target || target.stage === "confirmation") continue;

    mkdirSync("backups/forms", { recursive: true });
    const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${row.slug}.json`;
    writeFileSync(file, JSON.stringify(row, null, 2));

    const next = {
      ...doc,
      fields: doc.fields.map((f) =>
        f.key === "confirmed" ? { ...f, stage: "confirmation" as const } : f,
      ),
    };
    await prisma.eventForm.update({ where: { id: row.id }, data: { fields: next as unknown as object } });
    changed += 1;
    console.log(`${row.slug}: moved "${target.label}" to the confirmation stage`);
    console.log(`  ${doc.fields.length} questions before, ${next.fields.length} after — backup at ${file}`);
  }

  if (changed === 0) console.log("Nothing to move; every form already has it right.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); return prisma.$disconnect().then(() => process.exit(1)); });
