/**
 * PUT / DELETE /api/admin/merch/picks/[itemId] — star, unstar.
 *
 * One row per (person, item), so starring twice is not two stars. The
 * tally on the board is a count of these.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MERCH } from "@/lib/merch/types";

export const dynamic = "force-dynamic";

async function viewer() {
  const session = await requireRole("admin").catch(() => null);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function PUT(_req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { itemId } = await ctx.params;

  const known =
    MERCH.items.some((i) => i.id === itemId) ||
    (await prisma.merchCard.findUnique({ where: { itemId }, select: { id: true } })) !== null;
  if (!known) return NextResponse.json({ error: "No such item." }, { status: 404 });

  await prisma.merchPick.upsert({
    where: { userId_itemId: { userId, itemId } },
    update: {},
    create: { userId, itemId },
  });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { itemId } = await ctx.params;
  await prisma.merchPick.deleteMany({ where: { userId, itemId } });
  return new NextResponse(null, { status: 204 });
}
