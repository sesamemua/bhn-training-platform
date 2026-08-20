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

const prisma = new PrismaClient();

/** Oct 26-28 2026 — a Monday, Tuesday and Wednesday. Times are Toronto. */
const at = (day: 26 | 27 | 28, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 9, day, hour + 4, minute)); // EDT is UTC-4

const WORKSHOPS = [
  { slug: "ccrm-tour-lunch-learn-2026", title: "CCRM tour + Lunch & Learn", kind: "tour",
    start: at(26, 11), end: at(26, 14), capacity: 20, location: "CCRM, MaRS Discovery District",
    partner: "CCRM" },
  { slug: "catalent-tour-lunch-learn-2026", title: "Catalent tour + Lunch & Learn", kind: "tour",
    start: at(26, 11), end: at(26, 14), capacity: 20, location: "Catalent", partner: "Catalent" },
  { slug: "cl3-workshop-2026", title: "CL3 workshop", kind: "workshop",
    start: at(26, 9), end: at(26, 12), capacity: 10,
    location: "Toronto High Containment Facility", partner: null },
  { slug: "communication-chameleon-2026", title: "Communication Chameleon", kind: "workshop",
    start: at(27, 13), end: at(27, 16), capacity: 30, location: "MaRS", partner: null },
  { slug: "negotiation-skills-2026", title: "Negotiation Skills", kind: "workshop",
    start: at(27, 13), end: at(27, 16), capacity: 30, location: "MaRS", partner: null },
  { slug: "innovation-showcase-2026", title: "Innovation showcase", kind: "workshop",
    start: at(28, 9), end: at(28, 16), capacity: 100, location: "MaRS", partner: null },
];

async function main() {
  // ── the form ───────────────────────────────────────────────────────
  const slug = "training-week-registration-2026";
  const existing = await prisma.eventForm.findUnique({ where: { slug } });
  if (existing) {
    await prisma.eventForm.update({
      where: { slug },
      data: { title: "Training Week 2026 registration", fields: TRAINING_WEEK_FORM as unknown as object },
    });
    console.log(`Updated the form (${TRAINING_WEEK_FORM.fields.length} questions, ${TRAINING_WEEK_FORM.steps.length} steps).`);
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
  for (const [i, w] of WORKSHOPS.entries()) {
    const data = {
      title: w.title, kind: w.kind, startDateTime: w.start, endDateTime: w.end,
      capacity: w.capacity, waitlistCapacity: 5, locationName: w.location,
      partnerOrganization: w.partner, requiresApproval: true, isActive: true,
      displayOrder: i,
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
