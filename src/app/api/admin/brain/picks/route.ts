/**
 * POST /api/admin/brain/picks — pick one, several or everybody's brain.
 *
 * One route for all three, because "ask one person" and "ask the whole
 * team" differ only in the length of a list, and two routes would be two
 * places for the guards to drift apart. The caller sends the ids; the
 * client's "select all" is just a longer array.
 *
 * Creates the asks and nothing else. No email goes out: a request lands
 * on the platform and on the recipient's sidebar badge, and mailing six
 * colleagues should be a decision somebody makes on purpose rather than
 * inherits from a button.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOTHING, PICK_KINDS, PROBES } from "@/lib/brain/picker";
import { dispatchPicks } from "@/lib/brain/dispatch";
import { TEAM_ROLES } from "@/lib/brain/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PickBody = z.object({
  askedOfIds: z.array(z.string().min(1).max(100)).min(1).max(50),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(5_000),
  kind: z.enum(PICK_KINDS as unknown as [string, ...string[]]).default("question"),
  href: z.string().trim().max(500).optional(),
  bribe: z.string().trim().max(160).default(NOTHING),
  probe: z.string().trim().max(60).nullish(),
  /** Email them as part of asking. The send IS the ask — there is no
   *  separate approval step, because pressing this button was it. */
  notify: z.boolean().default(false),
});

/** A probe nothing implements would render a card with no verdict on it. */
export function validProbe(probe: string | null | undefined): string | null {
  return probe && PROBES[probe] ? probe : null;
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PickBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say what you want and who from." }, { status: 400 });
  const d = parsed.data;

  const wanted = [...new Set(d.askedOfIds)];
  if (wanted.includes(userId)) {
    return NextResponse.json({ error: "Picking your own brain is just thinking." }, { status: 400 });
  }

  // Resolve against the real team rather than trusting the ids: a stale
  // page should ask fewer people, never somebody who is not a colleague.
  const colleagues = await prisma.user.findMany({
    where: {
      id: { in: wanted, not: userId },
      isActive: true, accountKind: "real", role: { in: [...TEAM_ROLES] },
    },
    select: { id: true },
  });
  if (colleagues.length === 0) return NextResponse.json({ error: "That is not a colleague." }, { status: 404 });

  // createMany cannot return ids, and the dispatcher needs them, so the
  // rows are created one by one. At team size this is a handful of
  // inserts, not a loop worth optimising.
  const created = await Promise.all(
    colleagues.map((c) =>
      prisma.brainPick.create({
        data: {
          askedById: userId,
          askedOfId: c.id,
          subject: d.subject,
          body: d.body,
          kind: d.kind,
          href: d.href || null,
          bribe: d.bribe || NOTHING,
          probe: validProbe(d.probe),
        },
        select: { id: true },
      }),
    ),
  );

  if (!d.notify) return NextResponse.json({ created: created.length }, { status: 201 });

  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? req.nextUrl.origin;
  const { sent, failed } = await dispatchPicks(created.map((c) => c.id), userId, origin);
  return NextResponse.json({ created: created.length, sent, failed }, { status: 201 });
}
