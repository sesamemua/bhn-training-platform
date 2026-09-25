/**
 * Vercel Cron — one file a night with every registration in it.
 *
 *   GET /api/cron/registration-backup
 *
 * The per-registration copies (lib/events/registration-backup.ts) are
 * the real safety net: they leave as each person registers, so nothing
 * depends on a job having run. This is the other half — restoring from
 * two hundred separate emails is not restoring, it is an afternoon.
 * One attachment holds the lot, and yesterday's copy is still in the
 * mailbox if today's is wrong.
 *
 * Small on purpose: at roughly 3 KB a registration, a full Training
 * Week is about a megabyte, which is an ordinary email attachment. If
 * this ever outgrows that, the answer is a bucket, not a bigger email.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything registered through a public form; the whole picture, not one event's slice. */
const MAX_ROWS = 5_000;
const TO = () =>
  process.env.REGISTRATION_BACKUP_EMAIL ?? process.env.SMTP_FROM_EMAIL ?? "info@biohubnet.ca";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!mailConfigured()) {
    return NextResponse.json({ ok: false, reason: "No mail server is configured, so there is nowhere to send it." });
  }

  const rows = await prisma.eventFormSubmission.findMany({
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
    select: {
      id: true, email: true, createdAt: true, data: true,
      form: { select: { slug: true, title: true } },
      bookings: {
        select: {
          id: true, status: true, rank: true, bookedAt: true, approvedAt: true,
          workshop: { select: { slug: true, title: true, startDateTime: true } },
        },
        orderBy: { rank: "asc" },
      },
    },
  });

  const day = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ takenAt: new Date().toISOString(), count: rows.length, registrations: rows }, null, 2);

  /* Per form, so the subject line says what is in it without opening it. */
  const perForm = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.form.title] = (acc[r.form.title] ?? 0) + 1;
    return acc;
  }, {});

  await sendMail({
    to: TO(),
    subject: `Registration backup · everything as at ${day} · ${rows.length} registrations`,
    text:
      `Every registration on the platform, as at ${day}.\n\n` +
      Object.entries(perForm).map(([title, n]) => `  ${n}  ${title}`).join("\n") +
      `\n\nThe attachment is the whole thing: answers, the sessions each person asked for, ` +
      `and where each seat stands. Keep the most recent few; each one replaces the last.\n` +
      `This message is a backup — nothing is expected of you.\n`,
    attachments: [{
      filename: `registrations-${day}.json`,
      content: body,
      contentType: "application/json",
    }],
  });

  return NextResponse.json({ ok: true, registrations: rows.length, bytes: body.length });
}
