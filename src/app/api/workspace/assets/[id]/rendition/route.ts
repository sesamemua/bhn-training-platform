/** A ready-made size (LinkedIn, square, story…), cropped around the subject. */
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { RENDITIONS, type RenditionKey } from "@/lib/assets/core";
import { assetActor, assetUrl } from "@/lib/assets/store";
import { fitWithBackdrop } from "@/lib/assets/edit";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await assetActor(req, false);
  if ("error" in gate) return gate.error;
  const size = req.nextUrl.searchParams.get("size") as RenditionKey | null;
  const spec = size && RENDITIONS[size];
  if (!spec) return NextResponse.json({ error: "Unknown size." }, { status: 400 });
  const id = (await params).id;
  const a = await prisma.asset.findUnique({ where: { id }, select: { key: true, title: true, kind: true } });
  if (!a || a.kind !== "image") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const src = await fetch(assetUrl(a.key)!);
  if (!src.ok) return NextResponse.json({ error: "Couldn't read the original." }, { status: 502 });
  const bytes = Buffer.from(await src.arrayBuffer());
  const fit = req.nextUrl.searchParams.get("mode") === "fit";
  const out = fit ? await fitWithBackdrop(bytes, spec.width, spec.height) : await sharp(bytes, { pages: 1 })
    .resize(spec.width, spec.height, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const name = `${a.title.replace(/[^\w -]+/g, "").trim() || "asset"}-${size}${fit ? "-fit" : ""}.jpg`;
  if (req.nextUrl.searchParams.get("download")) await prisma.asset.update({ where: { id }, data: { downloads: { increment: 1 } } }).catch(() => {});
  return new NextResponse(new Uint8Array(out), { headers: {
    "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300",
    ...(req.nextUrl.searchParams.get("download") ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
  } });
}
