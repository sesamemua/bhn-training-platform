/**
 * PATCH /api/admin/brain/picks/[id] — answer or decline.
 *
 * Only the person who was asked may. The asker cannot mark their own
 * request as answered, which would defeat the entire premise.
 *
 * DELETE — the asker withdrawing an ask. The only way a row leaves.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["answered", "declined", "open"]),
  answer: z.string().trim().max(5_000).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const owned = await prisma.brainPick.findFirst({ where: { id, askedOfId: userId }, select: { id: true } });
  if (!owned) {
    return NextResponse.json({ error: "Only the person asked can answer it." }, { status: 404 });
  }

  await prisma.brainPick.update({
    where: { id },
    data: {
      status: parsed.data.status,
      answer: parsed.data.answer ?? null,
      answeredAt: parsed.data.status === "open" ? null : new Date(),
    },
  });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const { count } = await prisma.brainPick.deleteMany({ where: { id, askedById: userId } });
  if (count === 0) return NextResponse.json({ error: "Not yours to withdraw." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
