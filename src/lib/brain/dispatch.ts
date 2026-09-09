/**
 * Delivering the asks. The one module that can put email on the wire.
 *
 * Composition lives in email.ts, which has no transport and cannot send
 * anything; this is the only place that calls sendMail for a brain pick.
 * Two callers reach it — creating asks with `notify: true`, and the
 * recovery route for asks whose email failed — and neither runs on a
 * schedule. Nothing here is triggered by a cron, a sweep or a render: a
 * person presses send, or no mail moves.
 */
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { buildAskEmail } from "./email";
import { callNameOf, type PickKind } from "./picker";

export interface DispatchResult {
  sent: number;
  /** Addresses whose send threw. Their asks keep notifiedAt null. */
  failed: string[];
}

const SELECT = {
  id: true, subject: true, body: true, kind: true, bribe: true, href: true,
  askedOf: { select: { name: true, preferredName: true, email: true } },
} as const;

/**
 * Email the given asks, which must all belong to `askedById` and must
 * not have been emailed already.
 *
 * `notifiedAt` is stamped only after the provider returns, so a failure
 * leaves the ask queued for the recovery route rather than silently
 * marked delivered — and a second attempt cannot mail anyone twice,
 * because an already-stamped row is filtered out here.
 */
export async function dispatchPicks(
  ids: string[],
  askedById: string,
  origin: string,
): Promise<DispatchResult> {
  if (!mailConfigured() || ids.length === 0) return { sent: 0, failed: [] };

  const me = await prisma.user.findUnique({
    where: { id: askedById },
    select: { name: true, preferredName: true, email: true },
  });
  if (!me) return { sent: 0, failed: [] };

  const rows = await prisma.brainPick.findMany({
    where: { id: { in: ids }, askedById, notifiedAt: null },
    select: SELECT,
  });

  const askerName = callNameOf(me.name, me.preferredName, me.email);
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
      origin,
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
      await prisma.brainPick.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
      sent += 1;
    } catch {
      failed.push(row.askedOf.email);
    }
  }
  return { sent, failed };
}

/** Your asks whose email has not gone out — normally none, since sending
 *  happens as part of asking. A non-empty list means a send failed. */
export async function undelivered(askedById: string) {
  return prisma.brainPick.findMany({
    where: { askedById, notifiedAt: null },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
}
