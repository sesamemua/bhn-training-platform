/** Step 1 of a video upload: a signed URL the browser sends the file to directly. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/assets/core";
import { assetActor, presignVideoUpload } from "@/lib/assets/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const p = z.object({ fileName: z.string().min(1).max(200), type: z.enum(VIDEO_TYPES), size: z.number().int().positive().max(MAX_VIDEO_BYTES) })
    .safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Use an MP4, MOV or WebM video under 500 MB." }, { status: 400 });
  try { return NextResponse.json(await presignVideoUpload(p.data.fileName, p.data.type)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}
