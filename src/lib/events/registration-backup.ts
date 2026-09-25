/**
 * A copy of every registration, kept somewhere that is not this database.
 *
 * Training Week registrations are the one thing here that cannot be
 * recreated. A workshop's capacity can be retyped and a letter can be
 * resent, but nobody can reconstruct what two hundred people chose,
 * ranked, and told us about their diet — those answers existed for ten
 * seconds in a browser and then only here.
 *
 * So each one is emailed out as it arrives: the answers in the body so
 * a person can read them, and the whole thing as JSON attached so a
 * machine can put it back. The mailbox is the backup. That sounds
 * humble and it is the point — it needs no bucket, no second database,
 * no credentials anybody has to create, it survives this platform
 * entirely, and at roughly 3 KB a registration the whole week is about
 * a megabyte.
 *
 * It is deliberately NOT part of registering. A backup that can fail a
 * submission is worse than no backup, so everything here is caught and
 * swallowed: the registrant is never told about it and never waits for
 * it.
 *
 * `REGISTRATION_BACKUP_EMAIL` says where they go; without it they go to
 * the team address, which is better than nowhere.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";

const TO = () =>
  process.env.REGISTRATION_BACKUP_EMAIL ?? process.env.SMTP_FROM_EMAIL ?? "info@biohubnet.ca";

/** Keys the platform writes on a submission; shown apart from the answers. */
const RESERVED = /^__/;

/** The answers, written out the way somebody would read them aloud. */
function readable(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([k]) => !RESERVED.test(k))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : String(v ?? "")}`)
    .join("\n");
}

export async function backupRegistration(submissionId: string): Promise<void> {
  try {
    if (!mailConfigured()) return;

    const row = await prisma.eventFormSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true, email: true, createdAt: true, data: true,
        form: { select: { slug: true, title: true } },
        bookings: {
          select: {
            id: true, status: true, rank: true, bookedAt: true,
            workshop: { select: { slug: true, title: true, startDateTime: true } },
          },
          orderBy: { rank: "asc" },
        },
      },
    });
    if (!row) return;

    const data = (row.data ?? {}) as Record<string, unknown>;
    const who = String(data.full_name ?? data.name ?? "").trim() || row.email || "no name given";
    const sessions = row.bookings.map((b) => `  ${b.rank ?? "?"}. ${b.workshop.title} (${b.status})`).join("\n");

    await sendMail({
      to: TO(),
      subject: `Registration backup · ${row.form.title} · ${who}`,
      text:
        `${who} registered for ${row.form.title} at ${row.createdAt.toISOString()}.\n` +
        `Address: ${row.email ?? "—"}\nSubmission: ${row.id}\n\n` +
        `SESSIONS ASKED FOR\n${sessions || "  none"}\n\nANSWERS\n${readable(data)}\n\n` +
        `The attached JSON is the whole registration, enough to put it back if it is ever lost. ` +
        `This message is a backup — nothing is expected of you.\n`,
      attachments: [{
        filename: `registration-${row.id}.json`,
        content: JSON.stringify(row, null, 2),
        contentType: "application/json",
      }],
    });
  } catch {
    /*
     * Never the registrant's problem.
     *
     * They pressed a button and got a seat; a mail server that is slow
     * or refusing must not turn that into an error page, and must not
     * leave them pressing it again. The registration is already in the
     * database by the time this runs, and the nightly snapshot catches
     * whatever a failure here missed.
     */
  }
}
