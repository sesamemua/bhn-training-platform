/**
 * Delete last year's workshops. The week being run is 2026.
 *
 * These were retired (hidden) when the 2026 sessions went in; this
 * removes them. Deleting a Workshop CASCADES its bookings away, so the
 * rows are written to backups/ first and the script says exactly whose
 * bookings went with them — a count is not enough when the thing being
 * destroyed is somebody's registration.
 *
 * Only touches workshops that start before 2026 AND are already
 * retired. An active workshop is never deleted, whatever its date.
 *
 * Run: npx tsx scripts/remove-2025-workshops.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CUTOFF = new Date(Date.UTC(2026, 0, 1));

async function main() {
  const stale = await prisma.workshop.findMany({
    where: { startDateTime: { lt: CUTOFF }, isActive: false },
    include: { bookings: { include: { user: { select: { email: true, name: true } } } } },
  });

  if (stale.length === 0) {
    console.log("Nothing to remove — no retired pre-2026 workshops.");
    return;
  }

  const bookings = stale.flatMap((w) => w.bookings);
  console.log(`${stale.length} retired workshops from before 2026, carrying ${bookings.length} bookings:\n`);
  for (const w of stale) {
    console.log(`  ${w.startDateTime.toISOString().slice(0, 10)}  ${w.title}  (${w.bookings.length} bookings)`);
    for (const b of w.bookings) console.log(`      ${b.status.padEnd(10)} ${b.user?.email ?? "(no user)"}`);
  }

  if (!process.argv.includes("--force")) {
    console.log(`\nNothing deleted. Re-run with --force to remove them; a copy is written to backups/ first.`);
    return;
  }

  mkdirSync("backups/workshops", { recursive: true });
  const file = `backups/workshops/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-pre2026-workshops.json`;
  writeFileSync(file, JSON.stringify(stale, null, 2));
  console.log(`\nBacked up to ${file}`);

  const ids = stale.map((w) => w.id);
  const removedBookings = await prisma.workshopBooking.deleteMany({ where: { workshopId: { in: ids } } });
  const removed = await prisma.workshop.deleteMany({ where: { id: { in: ids } } });
  console.log(`Deleted ${removed.count} workshops and ${removedBookings.count} bookings.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); return prisma.$disconnect().then(() => process.exit(1)); });
