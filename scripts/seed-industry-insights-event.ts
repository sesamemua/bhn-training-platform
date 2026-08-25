/**
 * Create the Industry Insights event so speakers have somewhere to
 * submit to.
 *
 * The speaker intake is per EVENT — /events/<slug>/speaker collects a
 * headshot, bio, LinkedIn and what the session will offer, and files it
 * as a Speaker row against that event. Industry Insights had no event
 * row, so there was nowhere for its twelve invited hiring professionals
 * to send anything.
 *
 * DRAFT, not published. The speaker link works from a draft, and the
 * event stays off the public /events listing until somebody decides it
 * should be there — the biohubnet.ca page is where it is advertised,
 * and two public pages for one event is a way to have one of them go
 * stale.
 *
 * speakerIntakeOpen is ON: the whole point is to hand out the link.
 *
 * Run: npx tsx scripts/seed-industry-insights-event.ts [--force]
 */
import { PrismaClient } from "@prisma/client";
import {
  EVENT_DATE, EVENT_SUBTITLE, EVENT_TITLE, whenIs,
} from "../src/lib/industry-insights/schedule-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");

export const EVENT_SLUG = "2026-industry-insights";

async function main() {
  const existing = await prisma.bhnEvent.findUnique({
    where: { slug: EVENT_SLUG },
    select: { id: true, title: true, speakerIntakeOpen: true, status: true, _count: { select: { speakers: true } } },
  });

  if (existing && !FORCE) {
    console.log(`Already there: ${existing.title}`);
    console.log(`  status: ${existing.status} | intake open: ${existing.speakerIntakeOpen} | speakers: ${existing._count.speakers}`);
    console.log(`\n  Speaker link: /events/${EVENT_SLUG}/speaker`);
    console.log("\nRe-run with --force to update its details.");
    return;
  }

  const data = {
    title: EVENT_TITLE,
    tagline: EVENT_SUBTITLE,
    description:
      "A virtual afternoon with hiring professionals from biotechnology and life sciences companies. " +
      "Three hours, four company conversations in each, twenty participants to a conversation. " +
      "Each hour: a short overview of the company and its hiring process, then forty minutes of live Q&A.",
    // The afternoon it actually runs, in real instants rather than a
    // date with a guessed time on it.
    startDate: whenIs(1).start,
    endDate: whenIs(3).end,
    timezone: "America/Toronto",
    mainVenueName: "Online",
    // Draft: the speaker link works, and the event does not appear on
    // the public /events listing beside the biohubnet.ca page that is
    // already advertising it.
    status: "draft",
    speakerIntakeOpen: true,
  };

  if (existing) {
    await prisma.bhnEvent.update({ where: { slug: EVENT_SLUG }, data });
    console.log(`Updated ${EVENT_TITLE}.`);
  } else {
    await prisma.bhnEvent.create({ data: { slug: EVENT_SLUG, ...data } });
    console.log(`Created ${EVENT_TITLE}.`);
  }

  console.log(`  ${EVENT_DATE}, ${data.startDate.toISOString()} → ${data.endDate.toISOString()}`);
  console.log(`  status: ${data.status} (speaker link works; not on the public events list)`);
  console.log(`\n  Speaker link to hand out:\n    /events/${EVENT_SLUG}/speaker`);
  console.log(`  Submissions land in:\n    /admin/events/${EVENT_SLUG}/speakers`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)); });
