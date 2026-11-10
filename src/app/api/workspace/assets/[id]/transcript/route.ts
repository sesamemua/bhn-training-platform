/** Save a video's transcript: pasted text, or an uploaded .vtt / .srt / .txt caption file. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assetActor, embedAsset, transcribeVideo } from "@/lib/assets/store";
import { captionText } from "@/lib/assets/core";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const { id } = await params;
  const a = await prisma.asset.findUnique({ where: { id }, select: { kind: true } });
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as { retry?: boolean; text?: string };
    if (body.retry) { await transcribeVideo(id); const t = await prisma.asset.findUnique({ where: { id }, select: { transcript: true } }); return NextResponse.json({ transcript: t?.transcript ?? null }); }
    const text = (body.text ?? "").trim().slice(0, 100_000);
    await prisma.asset.update({ where: { id }, data: { transcript: text || null } });
    await embedAsset(id).catch(() => {});
    return NextResponse.json({ transcript: text || null });
  }
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size > 2_000_000) return NextResponse.json({ error: "Choose a .vtt, .srt or .txt file under 2 MB." }, { status: 400 });
  const text = captionText(await file.text()).slice(0, 100_000);
  await prisma.asset.update({ where: { id }, data: { transcript: text || null } });
  await embedAsset(id).catch(() => {});
  return NextResponse.json({ transcript: text || null });
}
