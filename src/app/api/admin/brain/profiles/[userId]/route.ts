/**
 * PUT /api/admin/brain/profiles/[userId] — set what somebody is good at.
 *
 * Any admin can edit any card, including their own. The drafted lines
 * the page ships with are guesses and are labelled as such; this is how
 * they stop being guesses.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { draftedFor } from "@/lib/brain/picker";
import { TEAM_ROLES } from "@/lib/brain/team";

export const dynamic = "force-dynamic";

const Body = z.object({
  speciality: z.string().trim().min(2).max(400),
  rate: z.string().trim().max(120).optional(),
});

export async function PUT(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const editorId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !editorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Write a speciality." }, { status: 400 });

  const target = await prisma.user.findFirst({
    where: { id: userId, isActive: true, accountKind: "real", role: { in: [...TEAM_ROLES] } },
    select: { email: true },
  });
  if (!target) return NextResponse.json({ error: "That is not a colleague." }, { status: 404 });

  const rate = parsed.data.rate?.trim() || draftedFor(target.email).rate;
  await prisma.brainProfile.upsert({
    where: { userId },
    update: { speciality: parsed.data.speciality, rate, updatedById: editorId },
    create: { userId, speciality: parsed.data.speciality, rate, updatedById: editorId },
  });
  return new NextResponse(null, { status: 204 });
}
