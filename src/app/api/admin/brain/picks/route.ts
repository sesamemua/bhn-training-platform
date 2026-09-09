/**
 * POST /api/admin/brain/picks — pick one person's brain.
 *
 * Creates the ask and nothing else. No email goes out: the request lands
 * on the platform and on their sidebar badge, and sending six colleagues
 * an unprompted email is a decision somebody should make on purpose
 * rather than inherit from a button.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOTHING, PICK_KINDS, PROBES } from "@/lib/brain/picker";
import { TEAM_ROLES } from "@/lib/brain/team";

export const dynamic = "force-dynamic";

export const PickBody = z.object({
  askedOfId: z.string().min(1).max(100),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(5_000),
  kind: z.enum(PICK_KINDS as unknown as [string, ...string[]]).default("question"),
  href: z.string().trim().max(500).optional(),
  bribe: z.string().trim().max(160).default(NOTHING),
  probe: z.string().trim().max(60).nullish(),
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

  if (d.askedOfId === userId) {
    return NextResponse.json({ error: "Picking your own brain is just thinking." }, { status: 400 });
  }
  const target = await prisma.user.findFirst({
    where: { id: d.askedOfId, isActive: true, accountKind: "real", role: { in: [...TEAM_ROLES] } },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "That is not a colleague." }, { status: 404 });

  const pick = await prisma.brainPick.create({
    data: {
      askedById: userId,
      askedOfId: d.askedOfId,
      subject: d.subject,
      body: d.body,
      kind: d.kind,
      href: d.href || null,
      bribe: d.bribe || NOTHING,
      probe: validProbe(d.probe),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: pick.id }, { status: 201 });
}
