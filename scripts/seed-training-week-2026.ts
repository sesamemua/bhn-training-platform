/**
 * Put the 2026 Training Week into the platform.
 *
 *   1. The registration form, ported out of the flow chart.
 *   2. The six 2026 sessions as Workshops, retiring last year's.
 *
 * Non-destructive by construction: last year's workshops are
 * deactivated, never deleted, because they carry bookings and deleting
 * one cascades those away. Re-runnable — matching rows are updated
 * rather than duplicated.
 *
 * Run: npx tsx scripts/seed-training-week-2026.ts
 */
import { PrismaClient } from "@prisma/client";
import { TRAINING_WEEK_FORM } from "../src/lib/formbuilder/training-week";
import { workshopRows } from "../src/lib/training-week/schedule-2026";

const prisma = new PrismaClient();

/*
 * The six sessions, from the one place the week is written down.
 *
 * They used to be typed out here as well, and the copy drifted from the
 * coordinators' plan — the two Monday tours were recorded as running at
 * the same hour when they in fact run back to back.
 */
const WORKSHOPS = workshopRows();

async function main() {
  // ── the form ───────────────────────────────────────────────────────
  const slug = "training-week-registration-2026";
  const existing = await prisma.eventForm.findUnique({ where: { slug } });
  if (existing) {
    /*
     * Does NOT overwrite by default, and this is not caution — it is a
     * bug that already happened. The first version updated
     * unconditionally, this script was re-run four times while working
     * on something else, and each run put back every question the
     * coordinator had deleted through the builder. A seed is for
     * creating a thing that is not there; once a person has edited it,
     * the file on disk is no longer the authority.
     */
    if (!process.argv.includes("--force")) {
      console.log(
        `The form already exists and may carry edits made in the builder.\n` +
        `Refusing to overwrite it. Re-run with --force to replace it — a copy\n` +
        `of the current version is written to backups/forms/ first.`,
      );
    } else {
      const { mkdirSync, writeFileSync } = await import("node:fs");
      mkdirSync("backups/forms", { recursive: true });
      const file = `backups/forms/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${slug}.json`;
      writeFileSync(file, JSON.stringify(existing, null, 2));
      console.log(`Backed up the current form to ${file}`);

      await prisma.eventForm.update({
        where: { slug },
        data: { title: "Training Week 2026 registration", fields: TRAINING_WEEK_FORM as unknown as object },
      });
      console.log(`Replaced the form (${TRAINING_WEEK_FORM.fields.length} questions, ${TRAINING_WEEK_FORM.steps.length} steps).`);
    }
  } else {
    await prisma.eventForm.create({
      data: {
        slug, title: "Training Week 2026 registration",
        description: "Ported from the flow chart. Questions, logic and the workflow the answers run through.",
        fields: TRAINING_WEEK_FORM as unknown as object,
      },
    });
    console.log(`Created the form (${TRAINING_WEEK_FORM.fields.length} questions, ${TRAINING_WEEK_FORM.steps.length} steps).`);
  }

  // ── the workshops ──────────────────────────────────────────────────
  const events = await prisma.bhnEvent.findMany({
    select: { id: true, title: true, _count: { select: { workshops: true } } },
  });
  const event = [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0];
  if (!event) throw new Error("No event to attach workshops to.");

  const wanted = new Set(WORKSHOPS.map((w) => w.slug));
  const current = await prisma.workshop.findMany({
    where: { eventId: event.id },
    select: { id: true, slug: true, title: true, _count: { select: { bookings: true } } },
  });

  // Retire, never delete: these rows carry bookings, and the FK
  // cascades — deleting one silently unregisters people.
  let retired = 0;
  for (const w of current) {
    if (wanted.has(w.slug)) continue;
    await prisma.workshop.update({ where: { id: w.id }, data: { isActive: false } });
    retired += 1;
    console.log(`  retired: ${w.title} (${w._count.bookings} bookings kept)`);
  }

  let made = 0;
  let updated = 0;
  for (const w of WORKSHOPS) {
    const data = {
      title: w.title, kind: w.kind, startDateTime: w.startDateTime, endDateTime: w.endDateTime,
      capacity: w.capacity, waitlistCapacity: 5, locationName: w.locationName,
      partnerOrganization: w.partnerOrganization, shortDescription: w.shortDescription,
      requiresApproval: true, isActive: true, displayOrder: w.displayOrder,
    };
    const found = current.find((c) => c.slug === w.slug);
    if (found) { await prisma.workshop.update({ where: { id: found.id }, data }); updated += 1; }
    else { await prisma.workshop.create({ data: { ...data, eventId: event.id, slug: w.slug } }); made += 1; }
  }

  console.log(`\nEvent: ${event.title}`);
  console.log(`Workshops: ${made} created, ${updated} updated, ${retired} retired.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); return prisma.$disconnect().then(() => process.exit(1)); });
