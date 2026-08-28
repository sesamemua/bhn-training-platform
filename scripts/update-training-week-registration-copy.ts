/**
 * Apply the August 2026 wording and ordering changes to the stored form.
 *
 * The database form is intentionally shorter than TRAINING_WEEK_FORM because
 * coordinators removed questions in the builder. This script changes only the
 * requested fields and preserves that live shape, existing field keys, and
 * existing submissions.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. Add --force to write; the
 * current form is backed up to backups/forms/ first.
 *
 * Run: npx tsx scripts/update-training-week-registration-copy.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG } from "../src/lib/allocation/symposium-2026";
import { BHN_STATUS_OPTIONS, TRAINING_WEEK_FORM } from "../src/lib/formbuilder/training-week";
import { BuiltFormSchema } from "../src/lib/formbuilder/types";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

interface Condition { field: string; op: string; value?: string }
type Field = Record<string, unknown> & {
  id?: string;
  key?: string;
  label?: string;
  help?: string;
  options?: string[];
  showWhen?: Condition[];
};
type Step = Record<string, unknown> & {
  id?: string;
  label?: string;
  note?: string;
  when?: Condition[];
};
type Document = {
  version?: unknown;
  fields: Field[];
  sources?: unknown[];
  steps?: Step[];
  submitNote?: string;
};

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN - nothing will be written. Add --force to apply.\n");

  const row = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG } });
  if (!row) throw new Error(`No form with slug ${REGISTRATION_FORM_SLUG}`);

  const doc = copy(row.fields) as Document;
  const codeField = (key: string) => TRAINING_WEEK_FORM.fields.find((field) => field.key === key);
  const liveField = (key: string) => doc.fields.find((field) => field.key === key);
  const changes = new Set<string>();

  const status = liveField("bhn_status");
  if (!status?.options) throw new Error("The eligibility question is not in the live form.");
  if (status.options.length !== BHN_STATUS_OPTIONS.length) {
    throw new Error(
      `The live eligibility question has ${status.options.length} answers; expected ${BHN_STATUS_OPTIONS.length}.`,
    );
  }

  const previousOptions = [...status.options];
  const rename = new Map(previousOptions.map((old, index) => [old, BHN_STATUS_OPTIONS[index]]));

  const translate = (condition: Condition, where: string) => {
    if (condition.field !== "bhn_status" || !condition.value) return;
    const next = condition.value
      .split(",")
      .map((part) => {
        const renamed = rename.get(part);
        if (!renamed) throw new Error(`${where} refers to unknown eligibility answer "${part}".`);
        return renamed;
      })
      .join(",");
    if (next !== condition.value) {
      condition.value = next;
      changes.add(`${where} eligibility rule`);
    }
  };

  for (const field of doc.fields) {
    for (const condition of field.showWhen ?? []) translate(condition, `field ${field.key ?? "?"}`);
  }
  for (const step of doc.steps ?? []) {
    for (const condition of step.when ?? []) translate(condition, `step ${step.id ?? "?"}`);
  }

  if (JSON.stringify(status.options) !== JSON.stringify(BHN_STATUS_OPTIONS)) {
    status.options = [...BHN_STATUS_OPTIONS];
    changes.add("eligibility answers");
  }
  const codeStatus = codeField("bhn_status");
  if (codeStatus?.help !== status.help) {
    status.help = codeStatus?.help;
    changes.add("eligibility question guidance");
  }

  for (const key of ["need_programme_note", "need_account_note"]) {
    const live = liveField(key);
    const code = codeField(key);
    if (!live || !code) throw new Error(`The live form is missing ${key}.`);
    if (live.label !== code.label) {
      live.label = code.label;
      changes.add(`${key} label`);
    }
    if (live.help !== code.help) {
      live.help = code.help;
      changes.add(`${key} guidance`);
    }
  }

  const postcode = liveField("postcode");
  const codePostcode = codeField("postcode");
  if (!postcode || !codePostcode) throw new Error("The live form is missing postcode.");
  if (postcode.label !== codePostcode.label) {
    postcode.label = codePostcode.label;
    changes.add("postal prefix label");
  }
  if (postcode.help !== codePostcode.help) {
    postcode.help = codePostcode.help;
    changes.add("postal prefix guidance");
  }

  const newsletter = liveField("newsletter_optin");
  if (!newsletter) throw new Error("The live form is missing newsletter_optin.");
  if (newsletter.help !== undefined) {
    delete newsletter.help;
    changes.add("newsletter frequency guidance removed");
  }

  const codeAccessibility = codeField("question");
  if (!codeAccessibility) throw new Error("The canonical accessibility question is missing.");
  let accessibilityAt = doc.fields.findIndex(
    (field) => field.key === "question" || /accessibility/i.test(field.label ?? ""),
  );
  if (accessibilityAt < 0) {
    doc.fields.push(copy(codeAccessibility) as Field);
    accessibilityAt = doc.fields.length - 1;
    changes.add("accessibility question added");
  }
  const accessibility = doc.fields[accessibilityAt];
  if (accessibility.label !== codeAccessibility.label) {
    accessibility.label = codeAccessibility.label;
    changes.add("accessibility label");
  }

  const [movedAccessibility] = doc.fields.splice(accessibilityAt, 1);
  const dietaryAt = doc.fields.findIndex((field) => field.key === "dietary_other");
  const fallbackDietaryAt = doc.fields.findIndex((field) => field.key === "dietary");
  const anchor = dietaryAt >= 0 ? dietaryAt : fallbackDietaryAt;
  if (anchor < 0) throw new Error("The live form has no dietary question to place accessibility beside.");
  const wasImmediatelyAfter = accessibilityAt === anchor + 1;
  doc.fields.splice(anchor + 1, 0, movedAccessibility);
  if (!wasImmediatelyAfter) changes.add("accessibility moved beside dietary");

  if (doc.submitNote !== TRAINING_WEEK_FORM.submitNote) {
    doc.submitNote = TRAINING_WEEK_FORM.submitNote;
    changes.add("photo and video consent");
  }

  const visibleCopy = [
    ...doc.fields.flatMap((field) => [field.label, field.help, ...(field.options ?? [])]),
    ...(doc.steps ?? []).flatMap((step) => [step.label, step.note]),
    doc.submitNote,
  ].filter((value): value is string => typeof value === "string");
  const british = visibleCopy.find((value) => /\bprogrammes?\b/i.test(value));
  if (british) throw new Error(`Visible copy still uses "programme": ${british}`);

  const removedAnswers = previousOptions.filter((old) => !BHN_STATUS_OPTIONS.includes(old));
  const serialized = JSON.stringify(doc);
  for (const old of removedAnswers) {
    if (serialized.includes(old)) throw new Error(`The old answer "${old}" is still referenced.`);
  }

  BuiltFormSchema.parse(doc);

  if (changes.size === 0) {
    console.log("Nothing to change.");
    return;
  }
  console.log("Changes:");
  for (const change of changes) console.log(`  - ${change}`);

  if (!FORCE) {
    console.log("\nRe-run with --force to apply.");
    return;
  }

  mkdirSync("backups/forms", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const backup = `backups/forms/${stamp}-before-training-week-copy-update.json`;
  writeFileSync(backup, JSON.stringify(row, null, 2));
  console.log(`\nBacked up to ${backup}`);

  await prisma.eventForm.update({ where: { id: row.id }, data: { fields: doc as object } });
  console.log("Applied.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    return prisma.$disconnect().then(() => process.exit(1));
  });
