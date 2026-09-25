/**
 * Show "Tell us about your journey" only when somebody asks for it.
 *
 * The box used to appear for everybody who said their trip is over two
 * hours, which put an open-ended question in front of people who had
 * nothing to add — including the ones whose postal code already agrees
 * with them. Now the travel note offers a button, "My journey is longer
 * than that", and the box appears when they press it.
 *
 * The button sets `travel_explain` to "Yes". It is not a question on
 * the form; it is an answer the note writes, and this condition is what
 * reads it. That keeps the showing and hiding in the form's own logic
 * engine rather than as a special case inside the renderer.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. --force writes,
 * backing up the form it replaces first.
 *
 * Run: npx tsx scripts/reveal-travel-note.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG_V2 } from "../src/lib/allocation/symposium-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

const KEY = "travel_note";
const CONDITION = { op: "is", field: "travel_explain", value: "Yes" };

async function main() {
  const form = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 } });
  if (!form) throw new Error(`${REGISTRATION_FORM_SLUG_V2} is not in the database.`);

  const doc = form.fields as { fields: Record<string, unknown>[] };
  const field = doc.fields.find((f) => f.key === KEY) as
    | { showWhen?: { op?: string; field?: string; value?: string }[]; help?: string }
    | undefined;
  if (!field) throw new Error(`There is no "${KEY}" question on the form.`);

  const already = (field.showWhen ?? []).some((c) => c.field === CONDITION.field);
  if (already) {
    console.log(`"${KEY}" already waits for travel_explain — nothing to do.`);
    return;
  }

  const next = {
    ...doc,
    fields: doc.fields.map((f) =>
      f.key === KEY
        ? {
            ...f,
            showWhen: [...((f.showWhen as unknown[]) ?? []), CONDITION],
            help:
              "Where you would be starting from, and the first train or bus you could take that gets you here in time. " +
              "We will look at it. We cannot promise travel support in advance.",
          }
        : f,
    ),
  };

  console.log(`"${KEY}" will be shown only when travel_explain is Yes.`);
  if (!FORCE) {
    console.log("\nDRY RUN — nothing written. Re-run with --force.");
    return;
  }

  mkdirSync("backups/forms", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = `backups/forms/${stamp}-${REGISTRATION_FORM_SLUG_V2}.json`;
  writeFileSync(file, JSON.stringify(form, null, 2));
  console.log(`  backed up → ${file}`);

  await prisma.eventForm.update({ where: { slug: REGISTRATION_FORM_SLUG_V2 }, data: { fields: next as object } });
  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); return prisma.$disconnect().then(() => process.exit(1)); });
