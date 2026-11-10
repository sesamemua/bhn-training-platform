/** Near-duplicates (by look) and similar pictures (by meaning) for one asset. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assetActor, similarAssets, toCard } from "@/lib/assets/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await assetActor(req, false);
  if ("error" in gate) return gate.error;
  const { duplicates, similar } = await similarAssets((await params).id);
  const rows = await prisma.asset.findMany({ where: { id: { in: [...duplicates, ...similar] } }, include: { _count: { select: { usages: true } } } });
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return NextResponse.json({
    duplicates: duplicates.flatMap((id) => byId.get(id) ?? []),
    similar: similar.flatMap((id) => byId.get(id) ?? []),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
