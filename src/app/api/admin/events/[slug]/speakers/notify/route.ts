/**
 * Tell a colleague about the speaker link.
 *
 *   GET  /api/admin/events/[slug]/speakers/notify
 *     The staff this admin can pick from — name + email, self excluded.
 *
 *   POST /api/admin/events/[slug]/speakers/notify
 *     body: { recipients: string[], note?: string }
 *     Sends each one a short email carrying the two links that matter:
 *     the public page the invited speaker fills in, and the admin page
 *     where what they send lands.
 *
 * One send per recipient rather than one email with everybody in To:.
 * A colleague forwarding this to a speaker should not be forwarding the
 * rest of the team's addresses with it.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail";
import {
  speakerLinkEmail,
  resolveRecipients,
  MAX_NOTE_CHARS,
  MAX_RECIPIENTS,
} from "@/lib/events/speaker-link-email";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * requireRole throws, which reaches the client as an opaque 500. That
 * is tolerable on a route nobody reads the error from; this one puts
 * its error straight in front of an admin, and "Internal Server Error"
 * when the real answer is "your session expired" costs them a support
 * message.
 */
async function admin(): Promise<{ user: { name?: string; email?: string } } | null> {
  try {
    return (await requireRole("admin")) as { user: { name?: string; email?: string } };
  } catch {
    return null;
  }
}

const DENIED = NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });

async function eventFor(slug: string) {
  return prisma.bhnEvent.findUnique({
    where: { slug },
    select: { title: true, speakerIntakeOpen: true },
  });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await admin();
  if (!session) return DENIED;
  await ctx.params;

  const me = session.user.email?.toLowerCase() ?? "";
  const staff = await prisma.user.findMany({
    where: { role: { in: ["instructor", "admin", "superadmin"] } },
    select: { name: true, email: true, role: true },
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    colleagues: staff
      .filter((u) => u.email && u.email.toLowerCase() !== me)
      .map((u) => ({ name: u.name ?? u.email!, email: u.email!, role: u.role })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const session = await admin();
  if (!session) return DENIED;
  const { slug } = await ctx.params;

  const event = await eventFor(slug);
  if (!event) return NextResponse.json({ error: "No such event." }, { status: 404 });

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment, so nothing was sent." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { recipients?: unknown; note?: unknown };
  const note = String(body.note ?? "").trim().slice(0, MAX_NOTE_CHARS);

  const { ok: recipients, bad } = resolveRecipients(
    Array.isArray(body.recipients) ? body.recipients.map((r) => String(r ?? "")) : [],
  );
  if (bad.length > 0) {
    return NextResponse.json({ error: `Not an email address: ${bad.join(", ")}` }, { status: 400 });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Pick at least one colleague." }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `That is ${recipients.length} people — ${MAX_RECIPIENTS} at a time is the limit.` },
      { status: 400 },
    );
  }

  const from = session.user;
  const mail = speakerLinkEmail({
    eventTitle: event.title,
    slug,
    intakeOpen: event.speakerIntakeOpen,
    senderName: from.name ?? from.email ?? "A colleague",
    note,
  });

  /*
   * Sent one at a time, and a failure does not abort the rest: one bad
   * address on a list of eight should cost that address, not the other
   * seven. The caller is told exactly who did and did not get it.
   */
  const sent: string[] = [];
  const failed: { email: string; reason: string }[] = [];
  for (const to of recipients) {
    try {
      await sendMail({
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        // So a reply reaches the person who actually sent this, not the
        // shared mailbox From is locked to.
        replyTo: from.email || undefined,
      });
      sent.push(to);
    } catch (e) {
      failed.push({ email: to, reason: (e as Error).message.slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: sent.length > 0, sent, failed });
}
