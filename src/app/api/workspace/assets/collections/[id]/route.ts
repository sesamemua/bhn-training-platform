/** Rename a collection, add/remove assets, turn its share link on or off, or delete it. */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assetActor, collectionCard } from "@/lib/assets/store";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  add: z.array(z.string()).max(400).optional(),
  remove: z.array(z.string()).max(400).optional(),
  /** Days the view-only link lasts; 0 turns sharing off. */
  shareDays: z.union([z.literal(0), z.literal(7), z.literal(30), z.literal(90)]).optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const c = await prisma.assetCollection.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const ids = [...new Set([...c.assetIds, ...(p.data.add ?? [])])].filter((x) => !(p.data.remove ?? []).includes(x));
  const share = p.data.shareDays === undefined ? {} : p.data.shareDays === 0
    ? { shareToken: null, shareExpiresAt: null }
    : { shareToken: c.shareToken ?? randomBytes(18).toString("base64url"), shareExpiresAt: new Date(Date.now() + p.data.shareDays * 86_400_000) };
  const saved = await prisma.assetCollection.update({ where: { id }, data: { ...(p.data.name ? { name: p.data.name } : {}), assetIds: ids, ...share } });
  return NextResponse.json({ collection: collectionCard(saved) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  await prisma.assetCollection.delete({ where: { id: (await params).id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
