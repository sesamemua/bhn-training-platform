/**
 * POST /api/showcase/audio
 *
 * PUBLIC (no auth) — one recorded answer for a testimonial link, sent just
 * before the form itself: stored in R2 and transcribed (Whisper), so the
 * submission can carry the recording and its words. Only the take the
 * person chose is sent; the others never leave their browser.
 *
 * Body: multipart/form-data — programSlug, audio (≤ 3 MB, ≤ about a minute).
 * Returns: { ok: true, key, url, transcript } or { error }.
 *
 * Guarded like the photo upload: the link must exist, be open, and be a
 * testimonial link (one with questions); type and size are checked here.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";
import { transcribe } from "@/lib/ai";
import { AUDIO_TYPES, MAX_AUDIO_BYTES, baseType } from "@/lib/showcase/testimonial";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!R2_PUBLIC_URL) return NextResponse.json({ error: "Uploads aren't configured. Contact us." }, { status: 500 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Couldn't read the recording." }, { status: 400 }); }

  const slug = String(form.get("programSlug") ?? "").trim();
  const group = await prisma.showcaseGroup.findUnique({ where: { slug }, select: { active: true, questions: true } });
  if (!group || !group.active || !Array.isArray(group.questions)) {
    return NextResponse.json({ error: "This form isn't taking recordings right now." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "The recording is empty — try again." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "That recording is too long — keep each answer to about a minute." }, { status: 413 });
  const type = baseType(audio.type);
  const ext = AUDIO_TYPES[type];
  if (!ext) return NextResponse.json({ error: `That kind of recording (${audio.type || "unknown"}) can't be used — try another browser.` }, { status: 400 });

  const bytes = Buffer.from(await audio.arrayBuffer());
  // 128-bit name: the bucket is public, so a guessable key would expose everyone's recordings.
  const key = `showcase/${slug}/audio/${randomUUID()}.${ext}`;
  try {
    await putR2Object(key, bytes, type);
  } catch (err) {
    console.error("[showcase-audio] R2 upload failed:", err);
    return NextResponse.json({ error: "The recording didn't upload — try again." }, { status: 502 });
  }

  // The words, for the team and the quote. A failure here is not the person's problem:
  // the recording is kept and the team can listen to it.
  const t = await transcribe(bytes, { feature: "showcase-testimonial" });
  return NextResponse.json({ ok: true, key, url: r2PublicUrl(key), transcript: t.ok ? t.text : "" });
}
