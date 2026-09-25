/**
 * Add "Tell us about your journey" to the Training Week registration.
 *
 * The postal code box now says what it thinks the journey is — under
 * two hours, close to it, or clearly over. Two of those need somewhere
 * for the registrant to answer back: the table knows a Forward
 * Sortation Area, they know their actual morning, and a ninety-minute
 * trip with one transfer that runs twice an hour is a real case the
 * table cannot see.
 *
 * Optional, and shown under the same condition as the postal code, so
 * it appears only for somebody who said they travel more than two
 * hours. Nobody is made to justify themselves.
 *
 * v1 of the form is frozen; this touches v2 only.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. --force writes,
 * backing up the form it replaces first.
 *
 * Run: npx tsx scripts/add-travel-note-field.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG_V2 } from "../src/lib/allocation/symposium-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

const KEY = "travel_note";

async function main() {
  const form = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 } });
  if (!form) throw new Error(`${REGISTRATION_FORM_SLUG_V2} is not in the database.`);

  const doc = form.fields as { fields: Record<string, unknown>[] };
  const at = doc.fields.findIndex((f) => f.key === "postcode");
  if (at < 0) throw new Error("There is no postcode question to put this after.");
  if (doc.fields.some((f) => f.key === KEY)) {
    console.log(`"${KEY}" is already on the form — nothing to do.`);
    return;
  }

  // The postal code's own condition, so the two appear and disappear together.
  const postcode = doc.fields[at] as { showWhen?: unknown[] };
  const field = {
    id: `f_${KEY}`,
    key: KEY,
    label: "Tell us about your journey (optional)",
    type: "long_text",
    required: false,
    options: [],
    help:
      "If the estimate above is wrong for your address, or your trip is close to two hours, describe the journey you would actually make — the first train or bus you could take, and when it gets you here. We will look at it. We cannot promise travel support in advance.",
    showWhen: postcode.showWhen ?? [],
    slots: [],
  };

  const next = { ...doc, fields: [...doc.fields.slice(0, at + 1), field, ...doc.fields.slice(at + 1)] };

  console.log(`Adding "${field.label}" after the postal code question.`);
  console.log(`  shown when: ${JSON.stringify(field.showWhen)}`);
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
