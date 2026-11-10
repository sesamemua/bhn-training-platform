/** Bulk actions on selected assets: tag, move, consent, trash, restore. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ASSET_FOLDERS, CONSENT, normalizeTags } from "@/lib/assets/core";
import { assetActor } from "@/lib/assets/store";

export const runtime = "nodejs";
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tag"), ids: z.array(z.string()).min(1).max(400), tags: z.array(z.string()).min(1).max(10) }),
  z.object({ action: z.literal("folder"), ids: z.array(z.string()).min(1).max(400), folder: z.enum(ASSET_FOLDERS) }),
  z.object({ action: z.literal("consent"), ids: z.array(z.string()).min(1).max(400), consent: z.enum(CONSENT) }),
  z.object({ action: z.literal("trash"), ids: z.array(z.string()).min(1).max(400) }),
  z.object({ action: z.literal("restore"), ids: z.array(z.string()).min(1).max(400) }),
]);

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const d = parsed.data;
  const editable = { id: { in: d.ids }, locked: false };
  let skipped = 0, count = 0;
  if (d.action === "tag") {
    const rows = await prisma.asset.findMany({ where: editable, select: { id: true, tags: true } });
    for (const r of rows) await prisma.asset.update({ where: { id: r.id }, data: { tags: normalizeTags([...r.tags, ...d.tags]) } });
    count = rows.length;
  } else if (d.action === "folder") count = (await prisma.asset.updateMany({ where: editable, data: { folder: d.folder } })).count;
  else if (d.action === "consent") count = (await prisma.asset.updateMany({ where: editable, data: { consent: d.consent } })).count;
  else if (d.action === "trash") {
    count = (await prisma.asset.updateMany({ where: { ...editable, usages: { none: {} }, deletedAt: null }, data: { deletedAt: new Date() } })).count;
  } else count = (await prisma.asset.updateMany({ where: { id: { in: d.ids } }, data: { deletedAt: null } })).count;
  skipped = d.ids.length - count;
  return NextResponse.json({ ok: true, count, skipped });
}
