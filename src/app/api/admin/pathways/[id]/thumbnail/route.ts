import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { generateImage, buildThumbnailPrompt, AI_CONFIGURED } from "@/lib/ai";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";
import { trackServer } from "@/lib/analytics";
import { applyDefaultOverlayIfAbsent } from "@/lib/courses/thumbnail-overlay-default";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = (session.user as { id?: string }).id;
  if (!AI_CONFIGURED.image) {
    return NextResponse.json({ error: "Image generation not configured." }, { status: 500 });
  }
  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "R2 storage not configured." }, { status: 500 });
  }

  const { id } = await params;
  const pathway = await prisma.pathway.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, category: true },
  });
  if (!pathway) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const customPrompt = (body.prompt as string | undefined)?.trim();
  const prompt = customPrompt && customPrompt.length > 5
    ? customPrompt
    : buildThumbnailPrompt(pathway);

  const png = await generateImage(prompt, { feature: "thumbnail_pathway", userId });
  if (!png) return NextResponse.json({ error: "Image generation failed." }, { status: 502 });

  const key = `thumbnails/pathways/${pathway.id}/${Date.now()}.png`;
  await putR2Object(key, Buffer.from(png), "image/png");
  const url = r2PublicUrl(key);

  await prisma.pathway.update({ where: { id }, data: { thumbnail: url } });
  trackServer({ userId, name: "thumbnail_generated", props: { type: "pathway", pathwayId: id } });

  // Apply the site-wide default overlay if one is configured AND
  // this pathway doesn't already have its own. Mirrors the course
  // regenerate behaviour so the "house style" is consistent.
  await applyDefaultOverlayIfAbsent("pathway", id).catch(() => null);

  // `url` + `prompt` are kept for backwards-compatibility with any
  // existing caller. `ok` + `thumbnail` + `motifs` mirror the course
  // regenerate endpoint so the /admin/cover-art batch UI can use a
  // single response normalizer for both course and pathway rows.
  // Pathways don't run the LLM motif-extractor step, so motifs is
  // an empty array.
  return NextResponse.json({
    ok: true,
    pathwayId: id,
    thumbnail: url,
    motifs: [] as string[],
    url,
    prompt,
  });
}
