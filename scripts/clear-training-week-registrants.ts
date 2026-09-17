/**
 * Empty the Training Week registrant list: every registration submitted to
 * the 2026 registration form (both versions) and every seat on this event's
 * workshops.
 *
 * Deleting a submission cascades the seats it asked for; seats booked
 * directly (an account, no registration behind it) are deleted separately,
 * because those are registrants on the page too.
 *
 * DRY RUN BY DEFAULT. `.env` points at production. --force writes, after
 * dumping everything it is about to delete to backups/registrants/ (which is
 * git-ignored, so the dump never leaves this machine).
 *
 * Run: npx tsx scripts/clear-training-week-registrants.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { REGISTRATION_FORM_WHERE } from "../src/lib/allocation/symposium-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

async function main() {
  console.log(FORCE ? "APPLYING — this deletes registration data.\n" : "DRY RUN — nothing is deleted. Add --force to apply.\n");

  const forms = await prisma.eventForm.findMany({ where: REGISTRATION_FORM_WHERE, select: { id: true, slug: true } });
  if (forms.length === 0) throw new Error("No registration form found — refusing to touch anything.");
  const formIds = forms.map((f) => f.id);

  // The Training Week event is the one with the most workshops — the same
  // rule the training-admin page uses to pick it.
  const events = await prisma.bhnEvent.findMany({
    select: { id: true, slug: true, title: true, _count: { select: { workshops: true } } },
  });
  const event = events.sort((a, b) => b._count.workshops - a._count.workshops)[0];
  if (!event || event._count.workshops === 0) throw new Error("No event with workshops — refusing to touch anything.");
  const workshops = await prisma.workshop.findMany({ where: { eventId: event.id }, select: { id: true, title: true } });
  const workshopIds = workshops.map((w) => w.id);

  const submissions = await prisma.eventFormSubmission.findMany({
    where: { formId: { in: formIds } },
    include: { bookings: true },
  });
  const loose = await prisma.workshopBooking.findMany({
    where: { workshopId: { in: workshopIds }, submissionId: null },
    include: { user: { select: { email: true, name: true } } },
  });

  console.log(`Form versions: ${forms.map((f) => f.slug).join(", ")}`);
  console.log(`Event: ${event.title} (${event.slug}) — ${workshops.length} workshops`);
  console.log(`Registrations to delete: ${submissions.length}`);
  console.log(`  seats they hold (deleted with them): ${submissions.reduce((n, s) => n + s.bookings.length, 0)}`);
  console.log(`Seats booked without a registration, also deleted: ${loose.length}`);
  for (const s of submissions) console.log(`  · ${s.email ?? "(no email)"} — ${s.bookings.length} seat(s), ${s.createdAt.toISOString().slice(0, 10)}`);
  for (const b of loose) console.log(`  · seat: ${b.user?.email ?? b.userId ?? "?"} (${b.status})`);

  if (!FORCE) {
    console.log("\nNothing written. Re-run with --force to delete.");
    return;
  }
  if (submissions.length === 0 && loose.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  mkdirSync("backups/registrants", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backup = `backups/registrants/${stamp}-training-week-registrants.json`;
  writeFileSync(backup, JSON.stringify({ event, forms, submissions, looseBookings: loose }, null, 2));
  console.log(`\nBacked up to ${backup}`);

  const seats = await prisma.workshopBooking.deleteMany({ where: { workshopId: { in: workshopIds } } });
  const subs = await prisma.eventFormSubmission.deleteMany({ where: { formId: { in: formIds } } });
  console.log(`Deleted ${subs.count} registration(s) and ${seats.count} seat(s).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
