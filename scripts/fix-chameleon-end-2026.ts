/**
 * Move the Communication Chameleon Workshop row's end from 16:00 to 16:30.
 *
 * The coordinators corrected the session to run until 4:30 pm, and the
 * schedule now says so. But the time people are actually TOLD — the
 * Admin email's {{session_time}}, the decision letter and the .ics
 * calendar entry — is read from Workshop.endDateTime, not from any form.
 * Until this row moves, every letter says 16:00, to v1 and v2 registrants
 * alike.
 *
 * Not apply-schedule-2026.ts. That script also rewrites forms and charts,
 * and this change needs none of that: ONE row, ONE column.
 *
 * DRY RUN BY DEFAULT. `.env` points at the production database. Add
 * --apply to write; the row is backed up to backups/workshops/ first.
 *
 * REFUSES rather than guesses. It moves the end only if it is exactly
 * 16:00 Toronto on the schedule's day now. Anything else — already
 * 16:30, or a time somebody set by hand — is reported and left alone,
 * and the write itself is conditional on that same value, so a change
 * made between the read and the write is not overwritten either.
 *
 * Run: npx tsx scripts/fix-chameleon-end-2026.ts [--apply]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SESSIONS, torontoToUtc } from "../src/lib/training-week/schedule-2026";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const SLUG = "communication-chameleon-2026";

const local = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short",
  }).format(d);

async function main() {
  console.log(APPLY ? "APPLYING.\n" : "DRY RUN — nothing will be written. Add --apply to apply.\n");

  const session = SESSIONS.find((s) => s.slug === SLUG);
  if (!session) throw new Error(`The schedule has no session ${SLUG}.`);
  // This script exists for exactly one move. If the schedule says
  // something else now, it is not the change this was written for.
  if (session.end !== "16:30") {
    throw new Error(`The schedule says ${SLUG} ends at ${session.end}, not 16:30 — this script is for that move only.`);
  }

  // Through the schedule's own conversion, never "hour + 4".
  const start = torontoToUtc(session.day, session.start);
  const oldEnd = torontoToUtc(session.day, "16:00");
  const newEnd = torontoToUtc(session.day, session.end);

  const rows = await prisma.workshop.findMany({ where: { slug: SLUG } });
  if (rows.length !== 1) {
    throw new Error(`Expected one Workshop with slug ${SLUG}, found ${rows.length} — refusing to pick one.`);
  }
  const row = rows[0];

  console.log(`Workshop: ${row.title} (${row.id})`);
  console.log(`  starts  ${local(row.startDateTime)}  ${row.startDateTime.toISOString()}`);
  console.log(`  ends    ${local(row.endDateTime)}  ${row.endDateTime.toISOString()}`);
  console.log(`  schedule: ${local(start)} – ${local(newEnd)}\n`);

  if (row.startDateTime.getTime() !== start.getTime()) {
    throw new Error(`Its start is not the schedule's ${session.start} — this is not the row the schedule describes. Left alone.`);
  }
  if (row.endDateTime.getTime() === newEnd.getTime()) {
    console.log("Already ends at 16:30. Nothing to change.");
    return;
  }
  if (row.endDateTime.getTime() !== oldEnd.getTime()) {
    throw new Error(
      `It ends at ${local(row.endDateTime)}, which is neither 16:00 nor 16:30 — somebody set it by hand. Refusing to overwrite.`,
    );
  }

  console.log(`Change: end ${local(oldEnd)} (${oldEnd.toISOString()}) → ${local(newEnd)} (${newEnd.toISOString()})`);
  console.log("Nothing else on the row moves. Bookings, capacity and forms are untouched.");

  if (!APPLY) {
    console.log("\nRe-run with --apply to apply.");
    return;
  }

  mkdirSync("backups/workshops", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = `backups/workshops/${stamp}-before-chameleon-end-${SLUG}.json`;
  writeFileSync(file, JSON.stringify(row, null, 2));
  console.log(`\nBacked up → ${file}`);

  // Conditional on the value just read: if it moved in between, this
  // matches nothing and says so, rather than writing over it.
  const { count } = await prisma.workshop.updateMany({
    where: { id: row.id, endDateTime: oldEnd },
    data: { endDateTime: newEnd },
  });
  if (count !== 1) throw new Error("The row changed between the read and the write. Nothing was written — look again.");

  const after = await prisma.workshop.findUniqueOrThrow({ where: { id: row.id }, select: { endDateTime: true } });
  if (after.endDateTime.getTime() !== newEnd.getTime()) {
    throw new Error(`Wrote, but it reads back as ${after.endDateTime.toISOString()}.`);
  }
  console.log(`Applied. It now ends ${local(after.endDateTime)}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    return prisma.$disconnect().then(() => process.exit(1));
  });
