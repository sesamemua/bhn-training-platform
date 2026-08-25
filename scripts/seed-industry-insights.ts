/**
 * Put the Industry Insights registration into the platform.
 *
 * Create-or-refuse, like the Training Week seed and for the same
 * reason: once a coordinator has edited a form in the builder, the file
 * on disk is no longer the authority. Re-running this without --force
 * would put back every question they deleted, which has happened before.
 *
 * Run: npx tsx scripts/seed-industry-insights.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  INDUSTRY_INSIGHTS_FORM, INDUSTRY_INSIGHTS_SLUG,
} from "../src/lib/formbuilder/industry-insights";
import { CONVERSATIONS, EVENT_SUBTITLE, EVENT_TITLE, unconfirmedCount } from "../src/lib/industry-insights/schedule-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function main() {
  const existing = await prisma.eventForm.findUnique({ where: { slug: INDUSTRY_INSIGHTS_SLUG } });

  const data = {
    title: `${EVENT_TITLE} — registration`,
    description: `${EVENT_SUBTITLE}. Thursday 24 September 2026, 1:00–4:00 PM ET, online. Three hours, four company conversations in each, twenty people to a conversation.`,
    fields: INDUSTRY_INSIGHTS_FORM as unknown as object,
  };

  if (!existing) {
    await prisma.eventForm.create({ data: { slug: INDUSTRY_INSIGHTS_SLUG, ...data, active: true } });
    console.log(`Created "${data.title}".`);
  } else if (!FORCE) {
    console.log(
      "The form already exists and may carry edits made in the builder.\n" +
      "Refusing to overwrite it. Re-run with --force to replace it — a copy of\n" +
      "the current version is written to backups/forms/ first.",
    );
    return report();
  } else {
    mkdirSync("backups/forms", { recursive: true });
    const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${INDUSTRY_INSIGHTS_SLUG}.json`;
    writeFileSync(file, JSON.stringify(existing, null, 2));
    console.log(`Backed up the current form to ${file}`);
    await prisma.eventForm.update({ where: { slug: INDUSTRY_INSIGHTS_SLUG }, data });
    console.log(`Replaced "${data.title}".`);
  }
  return report();
}

function report() {
  const tba = unconfirmedCount();
  console.log(`\n  ${INDUSTRY_INSIGHTS_FORM.fields.length} questions, ${INDUSTRY_INSIGHTS_FORM.steps.length} workflow steps`);
  console.log(`  ${CONVERSATIONS.length} conversations across 3 hours, ${CONVERSATIONS.length - tba} named and ${tba} still to be announced`);
  console.log(`\n  Public link: /apply/${INDUSTRY_INSIGHTS_SLUG}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)); });
