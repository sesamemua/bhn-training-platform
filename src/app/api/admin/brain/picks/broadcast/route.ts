/**
 * POST /api/admin/brain/picks/broadcast — pick everybody's brain at once.
 *
 * One row per colleague, skipping yourself. The audacity of asking six
 * people for the same favour in one click is the feature; the page keeps
 * the count where you can see it.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NOTHING } from "@/lib/brain/picker";
import { TEAM_ROLES } from "@/lib/brain/team";
import { PickBody, validProbe } from "../route";

export const dynamic = "force-dynamic";

const BroadcastBody = PickBody.omit({ askedOfId: true });

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = BroadcastBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say what you want." }, { status: 400 });
  const d = parsed.data;

  const colleagues = await prisma.user.findMany({
    where: {
      isActive: true, accountKind: "real",
      role: { in: [...TEAM_ROLES] },
      id: { not: userId },
    },
    select: { id: true },
  });
  if (colleagues.length === 0) {
    return NextResponse.json({ error: "There is nobody else here." }, { status: 404 });
  }

  const result = await prisma.brainPick.createMany({
    data: colleagues.map((c) => ({
      askedById: userId,
      askedOfId: c.id,
      subject: d.subject,
      body: d.body,
      kind: d.kind,
      href: d.href || null,
      bribe: d.bribe || NOTHING,
      probe: validProbe(d.probe),
    })),
  });
  return NextResponse.json({ sent: result.count }, { status: 201 });
}
