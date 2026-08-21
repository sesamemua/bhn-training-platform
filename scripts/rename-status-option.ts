/**
 * Rename the fourth answer, and keep the rule that depends on it in step.
 *
 * "I do not have a BioHubNet account yet" becomes "I am new to
 * BioHubNet". The option string is not just a label — it is the VALUE a
 * rule matches on, so the note that fires for that answer has to be
 * repointed in the same write. Change one without the other and the
 * option still shows, the note silently never appears, and nothing
 * complains: problems() checks that a condition names a live question,
 * not that its value is one the question offers.
 *
 * Also refreshes both notes, which now say what an EQUIP applicant
 * actually has to do: ENGAGE and EXPERIENCE run on the training
 * platform and need an account first, EQUIP does not use it at all.
 *
 * DRY RUN BY DEFAULT. `.env` is production. --force writes; the form is
 * backed up to backups/forms/ first.
 *
 * Run: npx tsx scripts/rename-status-option.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG } from "../src/lib/allocation/symposium-2026";
import { BHN_STATUS_OPTIONS, NO_ACCOUNT, TRAINING_WEEK_FORM } from "../src/lib/formbuilder/training-week";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

/** What the fourth answer used to say. */
const WAS = "I do not have a BioHubNet account yet";

interface Condition { field: string; op: string; value?: string }
type Field = Record<string, unknown> & { key?: string; options?: string[]; showWhen?: Condition[]; help?: string };

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG}`);
  const doc = row.fields as { fields: Field[] };
  const changes: string[] = [];

  const q1 = doc.fields.find((f) => f.key === "bhn_status");
  if (!q1) throw new Error("The eligibility question is not in the live form.");

  if (q1.options?.includes(WAS)) {
    q1.options = [...BHN_STATUS_OPTIONS];
    changes.push(`option "${WAS}" → "${NO_ACCOUNT}"`);
  } else if (q1.options?.includes(NO_ACCOUNT)) {
    console.log("The option is already renamed.");
  } else {
    throw new Error(`The fourth answer is neither the old nor the new wording: ${JSON.stringify(q1.options)}`);
  }

  // The rule, in the same write.
  let repointed = 0;
  for (const f of doc.fields) {
    for (const c of f.showWhen ?? []) {
      if (c.field === "bhn_status" && c.value === WAS) { c.value = NO_ACCOUNT; repointed += 1; }
    }
  }
  if (repointed) changes.push(`re-pointed ${repointed} rule${repointed === 1 ? "" : "s"} at the new wording`);

  // Refresh the wording of both notes from the code definition.
  for (const key of ["need_programme_note", "need_account_note"]) {
    const live = doc.fields.find((f) => f.key === key);
    const code = TRAINING_WEEK_FORM.fields.find((f) => f.key === key);
    if (!live || !code) continue;
    if (live.help === code.help && live.label === code.label) continue;
    live.help = code.help;
    live.label = code.label;
    changes.push(`${key}: wording refreshed`);
  }

  // Nothing should still name the old string.
  const stale = JSON.stringify(doc).includes(WAS);
  if (stale) throw new Error("Something still refers to the old wording — refusing to write a half-renamed form.");

  console.log(changes.length ? "Changes:" : "Nothing to change.");
  for (const c of changes) console.log(`  • ${c}`);
  if (!FORCE || changes.length === 0) {
    if (!FORCE && changes.length) console.log("\nRe-run with --force to apply.");
    return;
  }

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-before-rename.json`;
  writeFileSync(file, JSON.stringify(row, null, 2));
  console.log(`\nBacked up to ${file}`);
  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Applied.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)); });
