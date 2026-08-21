/**
 * Bring the live form's question one back in line with the code.
 *
 * Its four answers are not labels. They are the VALUES every rule
 * matches on — five questions, two workflow steps and both notes — so
 * rewording one is a rename across the whole document. Change the
 * option list alone and each rule keeps waiting for a sentence nobody
 * can pick any more: the questions behind it never appear, and nothing
 * complains, because problems() checks that a condition names a live
 * QUESTION, not that its value is one that question offers.
 *
 * Maps old to new BY POSITION, and refuses unless the live list is the
 * same length and every value it is asked to translate is one of the
 * old answers. Guessing which reworded sentence meant which is how
 * somebody's eligibility rule ends up pointing at the wrong person.
 *
 * DRY RUN BY DEFAULT. `.env` is production. --force writes; the form is
 * backed up to backups/forms/ first.
 *
 * Run: npx tsx scripts/resync-question-one.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG } from "../src/lib/allocation/symposium-2026";
import { BHN_STATUS_OPTIONS, TRAINING_WEEK_FORM } from "../src/lib/formbuilder/training-week";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

interface Condition { field: string; op: string; value?: string }
type Field = Record<string, unknown> & {
  key?: string; label?: string; help?: string; options?: string[]; showWhen?: Condition[];
};

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG}`);
  const doc = row.fields as { fields: Field[]; steps?: Record<string, unknown>[] };

  const q1 = doc.fields.find((f) => f.key === "bhn_status");
  if (!q1?.options) throw new Error("The eligibility question is not in the live form.");

  const was = [...q1.options];
  if (was.length !== BHN_STATUS_OPTIONS.length) {
    throw new Error(
      `The live question has ${was.length} answers and the code has ${BHN_STATUS_OPTIONS.length}. ` +
      "Adding or removing one is not a rename — do it in the builder, deliberately.",
    );
  }

  const rename = new Map(was.map((old, i) => [old, BHN_STATUS_OPTIONS[i]]));
  const moved = was.filter((old) => rename.get(old) !== old);

  /** Translate one condition value, which may list several answers. */
  const translate = (value: string | undefined, where: string) => {
    if (!value) return value;
    return value
      .split(",")
      .map((part) => {
        const next = rename.get(part);
        if (!next) {
          throw new Error(
            `${where} waits for "${part}", which is not one of the live answers. ` +
            "Refusing to guess which of the four it meant.",
          );
        }
        return next;
      })
      .join(",");
  };

  const touched: string[] = [];
  for (const f of doc.fields) {
    for (const c of f.showWhen ?? []) {
      if (c.field !== "bhn_status") continue;
      const next = translate(c.value, `"${f.key}"`);
      if (next !== c.value) { c.value = next; touched.push(f.key ?? "?"); }
    }
  }
  for (const st of doc.steps ?? []) {
    const s2 = st as { id?: string; when?: Condition[] };
    for (const c of s2.when ?? []) {
      if (c.field !== "bhn_status") continue;
      const next = translate(c.value, `step "${s2.id}"`);
      if (next !== c.value) { c.value = next; touched.push(`step ${s2.id}`); }
    }
  }

  q1.options = [...BHN_STATUS_OPTIONS];
  const code1 = TRAINING_WEEK_FORM.fields.find((f) => f.key === "bhn_status");
  if (code1?.help && q1.help !== code1.help) { q1.help = code1.help; touched.push("its hint"); }

  // The notes' wording comes from the code too, so the account language
  // and the address stay in step with the answers they belong to.
  /*
   * The sessions and dietary questions travel with them.
   *
   * The LABEL is only replaced where the live one is still the wording
   * this file shipped: a coordinator who renamed a question in the
   * builder meant it, and a sync that overwrites their words teaches
   * them not to use the builder. Help text is ours and is replaced.
   */
  for (const key of ["sessions", "dietary"]) {
    const live = doc.fields.find((f) => f.key === key);
    const code = TRAINING_WEEK_FORM.fields.find((f) => f.key === key);
    if (!live || !code) continue;
    if (live.help !== code.help) { live.help = code.help; touched.push(`${key} hint`); }
  }

  for (const key of ["need_programme_note", "need_account_note"]) {
    const live = doc.fields.find((f) => f.key === key);
    const code = TRAINING_WEEK_FORM.fields.find((f) => f.key === key);
    if (!live || !code) continue;
    if (live.help === code.help && live.label === code.label) continue;
    live.help = code.help;
    live.label = code.label;
    touched.push(key);
  }

  // Nothing may still name an answer that no longer exists.
  const gone = was.filter((old) => !BHN_STATUS_OPTIONS.includes(old));
  const body = JSON.stringify(doc);
  for (const old of gone) {
    if (body.includes(old)) throw new Error(`Something still names "${old}" — refusing to write a half-renamed form.`);
  }

  if (moved.length === 0 && touched.length === 0) { console.log("Nothing to change."); return; }
  if (moved.length) {
    console.log("Answers reworded:");
    for (const old of moved) console.log(`  • "${old}"\n    → "${rename.get(old)}"`);
  }
  if (touched.length) console.log(`\nRules and wording brought with them: ${[...new Set(touched)].join(", ")}`);

  if (!FORCE) { console.log("\nRe-run with --force to apply."); return; }

  mkdirSync("backups/forms", { recursive: true });
  const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-before-resync.json`;
  writeFileSync(file, JSON.stringify(row, null, 2));
  console.log(`\nBacked up to ${file}`);
  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Applied.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(String(e instanceof Error ? e.message : e)); return prisma.$disconnect().then(() => process.exit(1)); });
