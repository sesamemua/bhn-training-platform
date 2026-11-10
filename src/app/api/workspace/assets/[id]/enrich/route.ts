/** Re-run the AI caption and tags for one asset. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assetActor, enrichAsset } from "@/lib/assets/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const { id } = await params;
  await prisma.asset.update({ where: { id }, data: { caption: null, altText: null } }).catch(() => null);
  await enrichAsset(id);
  const a = await prisma.asset.findUnique({ where: { id }, select: { caption: true, altText: true, tags: true } });
  return a ? NextResponse.json(a) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
