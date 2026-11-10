/**
 * Generative expand: make a ready-made size without cropping by having AI
 * paint the missing edges. Saved as a NEW asset marked "AI-edited"; the
 * original is never changed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RENDITIONS, type RenditionKey } from "@/lib/assets/core";
import { assetActor, assetUrl, ingestAsset, toCard } from "@/lib/assets/store";
import { expandWithAI } from "@/lib/assets/edit";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const { size } = await req.json().catch(() => ({})) as { size?: RenditionKey };
  const spec = size && RENDITIONS[size];
  if (!spec) return NextResponse.json({ error: "Unknown size." }, { status: 400 });
  const a = await prisma.asset.findUnique({ where: { id: (await params).id } });
  if (!a || a.kind !== "image" || a.deletedAt) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const src = await fetch(assetUrl(a.key)!);
  if (!src.ok) return NextResponse.json({ error: "Couldn't read the original." }, { status: 502 });
  const out = await expandWithAI(Buffer.from(await src.arrayBuffer()), spec.width, spec.height, a.caption);
  if (!out) return NextResponse.json({ error: "The AI couldn't expand this picture right now. Use “Fit” for a blurred backdrop instead." }, { status: 502 });
  const { asset } = await ingestAsset({ bytes: out, fileName: `${a.title} · ${spec.label.split(" ·")[0]} (AI expand).jpg`, mimeType: "image/jpeg",
    folder: a.folder, tags: [...a.tags, "ai expand"], source: `AI expand of “${a.title}” (${a.id})`, origin: "ai_edited", actor: gate.actor });
  // Rights carry over: the same people are in the expanded picture.
  await prisma.asset.update({ where: { id: asset.id }, data: { people: a.people, consent: a.consent, credit: a.credit, license: a.license, expiresAt: a.expiresAt } });
  const row = await prisma.asset.findUnique({ where: { id: asset.id }, include: { _count: { select: { usages: true } } } });
  return NextResponse.json({ asset: row ? toCard(row) : null });
}
