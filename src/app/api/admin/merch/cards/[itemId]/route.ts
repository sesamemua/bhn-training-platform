/**
 * PATCH /api/admin/merch/cards/[itemId] — move an item between shelves.
 *
 * Works for a catalogue item and a pasted one alike. A catalogue item has
 * no row until it is moved, so this upserts: a board where nobody has
 * moved anything holds no rows at all.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MERCH } from "@/lib/merch/types";

export const dynamic = "force-dynamic";

const Body = z.object({ status: z.enum(["shortlist", "not_selected"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { itemId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const known =
    MERCH.items.some((i) => i.id === itemId) ||
    (await prisma.merchCard.findUnique({ where: { itemId }, select: { id: true } })) !== null;
  if (!known) return NextResponse.json({ error: "No such item." }, { status: 404 });

  await prisma.merchCard.upsert({
    where: { itemId },
    update: { status: parsed.data.status, movedById: userId, movedAt: new Date() },
    create: {
      itemId,
      source: "catalogue",
      status: parsed.data.status,
      movedById: userId,
      movedAt: new Date(),
    },
  });

  return new NextResponse(null, { status: 204 });
}
