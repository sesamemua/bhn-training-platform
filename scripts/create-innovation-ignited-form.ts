/**
 * Put Innovation Ignited's own registration live.
 *
 * The Wednesday session takes registrations from anybody, so it has a
 * page of its own with no programme list to check against and no
 * calendar to pick from — and its registrations still become seats in
 * the same workshop as the ones picked from the week's calendar
 * (presentation.session, read by makeSeats).
 *
 * The questions are TAKEN from the live Training Week document rather
 * than typed out here: full name, accessibility, dietary and its
 * follow-up are the same questions, so a change to their wording
 * reaches both forms the next time this runs.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. --force writes,
 * backing up whatever it replaces first.
 *
 * Run: npx tsx scripts/create-innovation-ignited-form.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_SLUG_V2 } from "../src/lib/allocation/symposium-2026";
import {
  buildInnovationIgnited, INNOVATION_IGNITED_SLUG, INNOVATION_IGNITED_TITLE,
} from "../src/lib/formbuilder/innovation-ignited";
import { parseForm } from "../src/lib/formbuilder/types";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function main() {
  const source = await prisma.eventForm.findUnique({ where: { slug: REGISTRATION_FORM_SLUG_V2 } });
  if (!source) throw new Error(`${REGISTRATION_FORM_SLUG_V2} is not in the database — nothing to share questions with.`);

  const built = buildInnovationIgnited(parseForm(source.fields));
  for (const problem of built.problems) console.log(`  ! ${problem}`);
  if (built.problems.length > 0) throw new Error("Refusing to write a form that failed its own checks.");

  const existing = await prisma.eventForm.findUnique({ where: { slug: INNOVATION_IGNITED_SLUG } });
  console.log(`${existing ? "Updating" : "Creating"} /apply/${INNOVATION_IGNITED_SLUG}`);
  console.log(`  questions: ${built.doc.fields.map((f) => f.key).join(", ")}`);
  console.log(`  shared with Training Week: ${built.shared.join(", ")}`);
  console.log(`  every registration books: ${built.doc.presentation?.session}`);
  console.log(`  open to the public: ${existing ? existing.active : true}`);

  if (!FORCE) {
    console.log("\nDRY RUN — nothing written. Re-run with --force.");
    return;
  }

  if (existing) {
    /*
     * Its own row, so its own backup. The questions are rebuilt from
     * the shared document every run, which is the point — but whoever
     * edited this one in the builder gets their copy kept.
     */
    mkdirSync("backups/forms", { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const file = `backups/forms/${stamp}-${INNOVATION_IGNITED_SLUG}.json`;
    writeFileSync(file, JSON.stringify(existing, null, 2));
    console.log(`  backed up → ${file}`);
  }

  await prisma.eventForm.upsert({
    where: { slug: INNOVATION_IGNITED_SLUG },
    create: {
      slug: INNOVATION_IGNITED_SLUG,
      title: INNOVATION_IGNITED_TITLE,
      description: "Innovation Ignited — pitch competition and venture showcase, Wednesday 28 October 2026 in Toronto. Open to anyone.",
      fields: built.doc as object,
      active: true,
    },
    update: { fields: built.doc as object, title: INNOVATION_IGNITED_TITLE },
  });
  console.log(`\nLive at /apply/${INNOVATION_IGNITED_SLUG}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); return prisma.$disconnect().then(() => process.exit(1)); });
