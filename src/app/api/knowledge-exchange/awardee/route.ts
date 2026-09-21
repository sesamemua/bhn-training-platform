/**
 * POST /api/knowledge-exchange/awardee
 *
 * PUBLIC (no auth) — a Knowledge Exchange awardee sends the details the
 * team uses to introduce them. Modelled on the speaker intake, which
 * solves the same problem for invited speakers: same R2 upload, random
 * key, cleanup if the row fails to save.
 *
 * Body: multipart/form-data — the TEXT_FIELDS in lib/knowledge-exchange/
 * intake, `quote`, `linkedin`, and `photo` (JPEG, PNG or WebP, up to
 * 4 MB; the form shrinks phone photos before sending).
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl, putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";
import { photoExtFor } from "@/lib/showcase/validation";
import {
  CURRENT_ROUND_KEY,
  PER_HOUR,
  PHOTO_MAX_BYTES,
  QUOTE_WORDS_KEY,
  checkAwardee,
  photoTypeOf,
  settingsFrom,
} from "@/lib/knowledge-exchange/intake";

export const runtime = "nodejs";

const refuse = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  if (!R2_PUBLIC_URL) return refuse("Uploads aren't set up. Please contact the BioHubNet team.", 500);

  const recent = await prisma.knowledgeExchangeAwardee.count({
    where: { createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
  });
  if (recent >= PER_HOUR) return refuse("The form is busier than usual. Please try again in a few minutes.", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("Couldn't read the form.", 400);
  }

  const settings = settingsFrom(
    await prisma.platformSetting.findMany({ where: { key: { in: [CURRENT_ROUND_KEY, QUOTE_WORDS_KEY] } } }),
  );
  const checked = checkAwardee((key) => form.get(key), settings.quoteMaxWords);
  if (!checked.ok) return refuse(checked.error, 400);

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return refuse("Please add a photo.", 400);
  if (photo.size > PHOTO_MAX_BYTES) return refuse("That photo is too large. Please choose one under 4 MB.", 413);
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const type = photoTypeOf(bytes);
  if (!type) return refuse("Please use a JPEG, PNG or WebP photo.", 400);

  // 128-bit token in the key: the bucket is publicly readable.
  const key = `knowledge-exchange/awardees/${randomBytes(16).toString("hex")}.${photoExtFor(type)}`;
  try {
    await putR2Object(key, bytes, type);
  } catch (err) {
    console.error("[ke-awardee] R2 upload failed:", err);
    return refuse("The photo didn't upload. Please try again.", 502);
  }

  try {
    await prisma.knowledgeExchangeAwardee.create({
      data: { ...checked.answers, round: settings.round, photoUrl: r2PublicUrl(key) },
    });
  } catch (err) {
    console.error("[ke-awardee] save failed:", err);
    await deleteR2ObjectByUrl(key);
    return refuse("Couldn't save your details. Please try again.", 500);
  }

  return NextResponse.json({ ok: true });
}
