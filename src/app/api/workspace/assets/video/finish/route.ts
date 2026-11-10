/** Step 2 of a video upload: confirm the file landed, save its poster frame, transcribe it. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ASSET_FOLDERS, VIDEO_TYPES } from "@/lib/assets/core";
import { assetActor, assetUrl, registerVideo, toCard } from "@/lib/assets/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const form = await req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "");
  const type = String(form?.get("type") ?? "");
  if (!/^assets\/as[a-z0-9]{22}\/v1-[a-f0-9]{8}\.(mp4|mov|webm)$/.test(key) || !(VIDEO_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  // The file must really be there; the browser's word isn't enough.
  const head = await fetch(assetUrl(key)!, { method: "HEAD" }).catch(() => null);
  if (!head?.ok) return NextResponse.json({ error: "The video didn't reach storage. Try again." }, { status: 409 });
  const num = (k: string) => { const v = Number(form?.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
  const poster = form?.get("poster");
  const folderIn = String(form?.get("folder") ?? "General");
  const asset = await registerVideo({
    key, mimeType: type, fileName: String(form?.get("fileName") ?? "video").slice(0, 200),
    sizeBytes: Number(head.headers.get("content-length")) || num("size") || 0,
    durationSec: num("duration"), width: num("width"), height: num("height"),
    poster: poster instanceof File && poster.size < 3_000_000 ? Buffer.from(await poster.arrayBuffer()) : null,
    folder: (ASSET_FOLDERS as readonly string[]).includes(folderIn) ? folderIn : "General", actor: gate.actor,
  });
  const row = await prisma.asset.findUnique({ where: { id: asset.id }, include: { _count: { select: { usages: true } } } });
  return NextResponse.json({ asset: row ? toCard(row) : null });
}
