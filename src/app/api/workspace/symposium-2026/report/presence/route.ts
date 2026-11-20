/**
 * Live presence on the Event Report (staff only), modelled on the script
 * editor's presence heartbeat. One POST both reports where you are and returns
 * everyone else seen in the last few seconds.
 *   body: { frame: "summary-0" | null, field: "Story text" | null, fieldIndex: number | null }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { colorForKey } from "@/lib/scripts/presence";
import { REPORT_ID } from "@/lib/symposium-report/document";

const ONLINE_MS = 12_000;
const SWEEP_MS = 120_000;
const input = z.object({
  frame: z.string().regex(/^[a-z0-9-]{1,80}$/).nullable(),
  field: z.string().max(80).nullable(),
  fieldIndex: z.number().int().min(0).max(500).nullable(),
});

export async function POST(req: Request) {
  const session = await requireRole("instructor").catch(() => null);
  const user = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  if (!user?.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid presence." }, { status: 400 });
  const { frame, field, fieldIndex } = parsed.data;
  const now = new Date();
  const data = { name: (user.name || user.email || "Someone").slice(0, 80), color: colorForKey(user.id), frame, field, fieldIndex: field ? fieldIndex : null, lastSeenAt: now };
  await prisma.pagePresence.upsert({
    where: { pageKey_userId: { pageKey: REPORT_ID, userId: user.id } },
    update: data, create: { pageKey: REPORT_ID, userId: user.id, ...data },
  });
  prisma.pagePresence.deleteMany({ where: { pageKey: REPORT_ID, lastSeenAt: { lt: new Date(now.getTime() - SWEEP_MS) } } }).catch(() => {});
  const peers = await prisma.pagePresence.findMany({
    where: { pageKey: REPORT_ID, userId: { not: user.id }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } },
    orderBy: { userId: "asc" }, // stable order so avatars don't reshuffle
    select: { userId: true, name: true, color: true, frame: true, field: true, fieldIndex: true },
  });
  return NextResponse.json({ peers });
}
