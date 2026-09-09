/**
 * POST /api/admin/brain/notify — send the emails, now, because you said so.
 *
 * The one place in this feature that can deliver mail. Nothing else does:
 * creating an ask never sends, the daily crons do not touch this table,
 * and there is no scheduled sweep. An email leaves only when a person
 * clicks send and this route runs.
 *
 * Body: { ids: string[] } — the asks to email, all of which must be
 * yours. Already-emailed asks are skipped rather than sent twice, so a
 * double click cannot mail a colleague the same request again.
 *
 * GET — a dry run: who WOULD be emailed, so the button can show the list
 * before anything goes out.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { buildAskEmail } from "@/lib/brain/email";
import { callNameOf, type PickKind } from "@/lib/brain/picker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(50) });

const origin = (req: NextRequest) =>
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;

/** Your asks that nobody has been emailed about yet. */
async function unsent(userId: string) {
  return prisma.brainPick.findMany({
    where: { askedById: userId, notifiedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, subject: true, body: true, kind: true, bribe: true, href: true,
      askedOf: { select: { name: true, preferredName: true, email: true } },
    },
  });
}

export async function GET() {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await unsent(userId).catch(() => []);
  return NextResponse.json({
    mailConfigured: mailConfigured(),
    pending: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      to: r.askedOf.email,
      name: callNameOf(r.askedOf.name, r.askedOf.preferredName, r.askedOf.email),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email is not configured on this environment." }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Nothing selected to send." }, { status: 400 });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, preferredName: true, email: true },
  });
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only your own, only the ones nobody has been emailed about. A stale
  // page can therefore send fewer emails than it offered, never more.
  const rows = await prisma.brainPick.findMany({
    where: { id: { in: parsed.data.ids }, askedById: userId, notifiedAt: null },
    select: {
      id: true, subject: true, body: true, kind: true, bribe: true, href: true,
      askedOf: { select: { name: true, preferredName: true, email: true } },
    },
  });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Those have all been emailed already." }, { status: 409 });
  }

  const askerName = callNameOf(me.name, me.preferredName, me.email);
  const base = origin(req);
  let sent = 0;
  const failed: string[] = [];

  for (const row of rows) {
    const mail = buildAskEmail({
      callName: callNameOf(row.askedOf.name, row.askedOf.preferredName, row.askedOf.email),
      askerName,
      subject: row.subject,
      body: row.body,
      kind: row.kind as PickKind,
      bribe: row.bribe,
      href: row.href,
      origin: base,
    });
    try {
      await sendMail({
        to: row.askedOf.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        // A reply should reach the person who asked, not a mailbox nobody reads.
        replyTo: me.email,
      });
      // Stamped only after the send returns, so a failure leaves the ask
      // in the queue rather than silently marking it delivered.
      await prisma.brainPick.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
      sent += 1;
    } catch {
      failed.push(row.askedOf.email);
    }
  }

  return NextResponse.json({ sent, failed });
}
