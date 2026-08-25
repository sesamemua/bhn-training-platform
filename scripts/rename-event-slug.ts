/**
 * Rename the event's slug from last year's number to this year's.
 *
 * The slug is in the URL of every public page for the event — the
 * landing page, registration, the attendee dashboard, the .ics feed and
 * the speaker intake link that goes out to invited speakers. Sending
 * somebody a link with 2025 in it for a 2026 event is a small thing
 * that undermines everything around it.
 *
 * The old URL KEEPS WORKING: next.config redirects it. Links already
 * sent, the onboarding tour, and biohubnet.ca's own link into the
 * platform must not break because we tidied a number.
 *
 * The primary key is NOT touched. `evt-2025-annual-symposium` is
 * referenced by every workshop, registration and speaker row; renaming
 * an id to make it read nicely is how you break a database for
 * cosmetics. It is invisible to anybody outside this table.
 *
 * DRY RUN BY DEFAULT. `.env` is production.
 *
 * Run: npx tsx scripts/rename-event-slug.ts [--force]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

const FROM = "2025-annual-symposium";
const TO = "2026-annual-symposium";

async function main() {
  console.log(FORCE ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const event = await prisma.bhnEvent.findUnique({
    where: { slug: FROM },
    select: {
      id: true, slug: true, title: true, startDate: true,
      _count: { select: { workshops: true, registrations: true, speakers: true } },
    },
  });
  if (!event) {
    const already = await prisma.bhnEvent.findUnique({ where: { slug: TO }, select: { id: true } });
    console.log(already ? "Already renamed." : `No event with slug "${FROM}".`);
    return;
  }

  // Refuse rather than collide: a second event already using the new
  // slug means somebody has made one, and overwriting is not a rename.
  const taken = await prisma.bhnEvent.findUnique({ where: { slug: TO }, select: { id: true, title: true } });
  if (taken) throw new Error(`"${TO}" is already used by ${taken.title}. Not renaming.`);

  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric" }).format(event.startDate);
  console.log(`${event.title}`);
  console.log(`  runs in:       ${year}`);
  console.log(`  slug:          ${FROM} → ${TO}`);
  console.log(`  id (unchanged): ${event.id}`);
  console.log(`  carries:       ${event._count.workshops} workshops, ${event._count.registrations} registrations, ${event._count.speakers} speakers`);
  console.log("\nURLs that change (the old ones redirect):");
  for (const p of ["", "/register", "/speaker", "/me", "/calendar.ics"]) {
    console.log(`  /events/${TO}${p}`);
  }

  // The event says 2026; the slug saying 2025 is the thing being fixed.
  if (year !== TO.slice(0, 4)) {
    throw new Error(`The event runs in ${year}, so renaming it to "${TO}" would make the URL wrong in the other direction.`);
  }

  if (!FORCE) { console.log("\nRe-run with --force to apply."); return; }
  await prisma.bhnEvent.update({ where: { id: event.id }, data: { slug: TO } });
  console.log("\nRenamed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(String(e instanceof Error ? e.message : e)); return prisma.$disconnect().then(() => process.exit(1)); });
