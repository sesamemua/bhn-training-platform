/**
 * Platform-wide "tell a colleague".
 *
 *   GET  /api/admin/notify?feature=<id>&context=<slug>
 *     Who can be picked (staff + address book) and the links the email
 *     will carry, so the panel can show them before anything is sent.
 *
 *   POST /api/admin/notify
 *     body: { feature, context?, recipients: string[], note?, caveat? }
 *     One email per recipient, addressed to them by name.
 *
 * Not tied to any one feature: the wording comes from the register in
 * src/lib/notify/features.ts, keyed by an id the client sends. A server
 * that took its wording from the browser would send whatever anybody
 * posted to it.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail";
import { notifyFeature } from "@/lib/notify/features";
import { notifyEmail, absolute } from "@/lib/notify/email";
import {
  resolveRecipients,
  MAX_RECIPIENTS,
  MAX_NOTE_CHARS,
  MAX_ADDRESS_CHARS,
  PER_SENDER_PER_HOUR,
} from "@/lib/notify/recipients";

export const runtime = "nodejs";
export const maxDuration = 60;

/*
 * requireRole throws, which reaches the client as an opaque 500. This
 * route puts its errors straight in front of an admin, and "Internal
 * Server Error" when the real answer is "your session expired" costs
 * them a support message.
 */
async function admin(): Promise<{ id?: string; name?: string; email?: string } | null> {
  try {
    const s = await requireRole("admin");
    return s.user as { id?: string; name?: string; email?: string };
  } catch {
    return null;
  }
}

const DENIED = () =>
  NextResponse.json({ error: "You need to be signed in as an admin." }, { status: 403 });

export async function GET(req: NextRequest) {
  const me = await admin();
  if (!me) return DENIED();

  const featureId = req.nextUrl.searchParams.get("feature") ?? "";
  const context = req.nextUrl.searchParams.get("context");
  const feature = notifyFeature(featureId);
  if (!feature) return NextResponse.json({ error: "No such feature." }, { status: 404 });

  const mine = me.email?.toLowerCase() ?? "";
  const [staff, contacts] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["instructor", "admin", "superadmin"] } },
      select: { name: true, email: true, role: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.notifyContact.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  // An address in both lists is one person. The address book wins,
  // because somebody typed that name on purpose.
  const booked = new Set(contacts.map((c) => c.email.toLowerCase()));

  return NextResponse.json({
    ok: true,
    feature: { id: feature.id, name: feature.name, intro: feature.intro },
    links: feature.links(context).map((l) => ({ ...l, url: absolute(l.path) })),
    staff: staff
      .filter((u) => u.email && u.email.toLowerCase() !== mine && !booked.has(u.email.toLowerCase()))
      .map((u) => ({ name: u.name ?? u.email!, email: u.email!, role: u.role })),
    contacts,
  });
}

export async function POST(req: NextRequest) {
  const me = await admin();
  if (!me) return DENIED();

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment, so nothing was sent." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    feature?: unknown;
    context?: unknown;
    recipients?: unknown;
    note?: unknown;
  };

  const feature = notifyFeature(String(body.feature ?? ""));
  if (!feature) return NextResponse.json({ error: "No such feature." }, { status: 404 });

  const context = body.context == null ? null : String(body.context).slice(0, 200);
  if (feature.needsContext && !context) {
    return NextResponse.json(
      { error: `This needs a ${feature.contextLabel ?? "context"} to build its links.` },
      { status: 400 },
    );
  }

  const raw = Array.isArray(body.recipients) ? body.recipients : [];
  // Bounded before any parsing: this list arrives from the network.
  if (raw.length > MAX_RECIPIENTS * 4) {
    return NextResponse.json({ error: "That is far too many addresses." }, { status: 413 });
  }
  const { ok: recipients, bad } = resolveRecipients(
    raw.map((r) => String(r ?? "").slice(0, MAX_ADDRESS_CHARS + 1)),
  );
  if (bad.length > 0) {
    return NextResponse.json({ error: `Not an email address: ${bad.join(", ")}` }, { status: 400 });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `That is ${recipients.length} people — ${MAX_RECIPIENTS} at a time is the limit.` },
      { status: 400 },
    );
  }

  /*
   * A ceiling per admin per hour, counted in the log table.
   *
   * The threat is not the admin — it is a session somebody else is
   * holding. An in-memory counter would not survive a function being
   * recycled between the first request and the second, which is
   * precisely the interval an attacker would use.
   */
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const alreadySent = me.id
    ? await prisma.notifyLog.count({ where: { senderId: me.id, createdAt: { gte: since } } })
    : 0;
  if (alreadySent + recipients.length > PER_SENDER_PER_HOUR) {
    return NextResponse.json(
      {
        error: `That would be more than ${PER_SENDER_PER_HOUR} notifications from you in an hour. Nothing was sent — try again later, or split it up.`,
      },
      { status: 429 },
    );
  }

  /*
   * Names are looked up here, never taken from the request. The
   * greeting is the one part of this email that says "somebody wrote
   * this to me", so it has to be right, and a client that can set it
   * can put anything in front of a real person's eyes.
   */
  const [users, contacts] = await Promise.all([
    /*
     * Exact `in` on both spellings, then matched case-insensitively in
     * JS. `mode: "insensitive"` on an `in` filter compiles to ILIKE
     * with the values bound raw, and `_` is a LIKE wildcard that passes
     * isEmail — a recipient could otherwise pull back a different
     * person's name and be greeted by it.
     */
    prisma.user.findMany({
      where: { email: { in: [...recipients, ...recipients.map((r) => r.toLowerCase())] } },
      select: { name: true, email: true },
    }),
    prisma.notifyContact.findMany({
      // Contacts are stored lowercased, so this is exact.
      where: { email: { in: recipients.map((r) => r.toLowerCase()) } },
      select: { name: true, email: true },
    }),
  ]);
  const nameFor = new Map<string, string>();
  for (const u of users) if (u.email && u.name) nameFor.set(u.email.toLowerCase(), u.name);
  // The address book wins: somebody typed that name deliberately.
  for (const c of contacts) nameFor.set(c.email.toLowerCase(), c.name);

  const senderName = me.name ?? me.email ?? "A colleague";
  const contextName = (await feature.contextName?.(context)) ?? null;
  const note = String(body.note ?? "").trim().slice(0, MAX_NOTE_CHARS);
  // Resolved from the database by the feature itself. The browser does
  // not get to choose what this email says — a stale tab would happily
  // report a form as open minutes after somebody else closed it.
  const caveat = (await feature.caveat?.(context)) ?? "";

  /*
   * One at a time, and a failure does not abort the rest: one bad
   * address on a list of eight should cost that address, not the other
   * seven. The caller is told exactly who did and did not get it.
   */
  const sent: string[] = [];
  const failed: { email: string; reason: string }[] = [];
  for (const to of recipients) {
    const mail = notifyEmail({
      feature,
      context,
      recipientName: nameFor.get(to.toLowerCase()) ?? "",
      senderName,
      senderEmail: me.email,
      note,
      caveat,
      contextName,
    });
    try {
      await sendMail({
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        // So a reply reaches whoever pressed Send, not the shared
        // mailbox From is locked to.
        replyTo: me.email || undefined,
      });
      sent.push(to);
    } catch (e) {
      failed.push({ email: to, reason: (e as Error).message.slice(0, 200) });
    }
  }

  /*
   * Logged after the fact and only for what actually went — a row here
   * means the mail server took it. Written in one statement so a slow
   * insert cannot stretch the send loop, and failures to log are
   * swallowed: an unrecorded send is a gap in an audit trail, but
   * telling the admin their email failed when it did not is worse.
   */
  if (sent.length > 0) {
    await prisma.notifyLog
      .createMany({
        data: sent.map((recipient) => ({
          featureId: feature.id,
          context,
          recipient,
          senderId: me.id ?? null,
        })),
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: sent.length > 0, sent, failed });
}
