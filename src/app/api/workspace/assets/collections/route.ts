/** Collections: hand-picked sets of assets. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assetActor, collectionCard } from "@/lib/assets/store";
import { SmartQuery } from "@/lib/assets/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const gate = await assetActor(req, false);
  if ("error" in gate) return gate.error;
  const rows = await prisma.assetCollection.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ collections: rows.map(collectionCard) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const p = z.object({ name: z.string().trim().min(1).max(80), assetIds: z.array(z.string()).max(400).default([]), query: SmartQuery.optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Name the collection." }, { status: 400 });
  const c = await prisma.assetCollection.create({ data: { name: p.data.name, assetIds: [...new Set(p.data.assetIds)], createdById: gate.actor.id,
    ...(p.data.query ? { query: p.data.query } : {}) } });
  return NextResponse.json({ collection: collectionCard(c) });
}
