/**
 * POST /api/events/[slug]/speaker-intake
 *
 * PUBLIC (no auth) — a guest speaker or panellist submits their own
 * details for the event website: headshot, name, title, organisation,
 * bio, topics.
 *
 * Modelled on /api/showcase/submit, which solves the same problem for
 * graduates: a person outside the platform needs to hand us a photo and
 * a few fields without an account. Same R2 upload, same validation
 * helpers, same abuse capture. It differs in the gate — an event opens
 * intake explicitly (`speakerIntakeOpen`) rather than per submission
 * group, and every row lands as a draft for an admin to place on the
 * programme.
 *
 * Body: multipart/form-data — name, title, organization, bio, topics
 * (comma separated), email, photo (image/*, <5MB).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL, deleteR2ObjectByUrl } from "@/lib/r2";
import { MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, photoExtFor, normaliseLinkedin } from "@/lib/showcase/validation";
import { BIO_LIMIT } from "./shorten/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "Uploads aren't configured. Contact us." }, { status: 500 });
  }

  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: { id: true, title: true, speakerIntakeOpen: true },
  });
  if (!event) return NextResponse.json({ error: "Unknown event." }, { status: 404 });
  if (!event.speakerIntakeOpen) {
    return NextResponse.json(
      { error: "This event isn't collecting speaker details right now." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read the form." }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const organization = String(form.get("organization") ?? "").trim();
  const bio = String(form.get("bio") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const linkedinRaw = String(form.get("linkedin") ?? "").trim();
  const sessionPitch = String(form.get("sessionPitch") ?? "").trim();
  const topics = String(form.get("topics") ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  const photo = form.get("photo");

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Please give your full name." }, { status: 400 });
  }
  if (title.length > 160) {
    return NextResponse.json({ error: "Title is a little long — keep it under 160 characters." }, { status: 400 });
  }
  if (organization.length > 160) {
    return NextResponse.json({ error: "Organisation is a little long — keep it under 160 characters." }, { status: 400 });
  }
  // Hard-capped at the same limit the form counts down to, so a pasted
  // bio cannot slip past the counter.
  if (bio.length < 20 || bio.length > BIO_LIMIT) {
    return NextResponse.json(
      { error: `A short bio, please — between 20 and ${BIO_LIMIT} characters. Yours is ${bio.length}.` },
      { status: 400 },
    );
  }
  if (sessionPitch.length > 600) {
    return NextResponse.json({ error: "Keep the session description under 600 characters." }, { status: 400 });
  }

  // Accepts a full URL or a bare handle; stored canonical or not at all.
  const linkedinUrl = linkedinRaw ? normaliseLinkedin(linkedinRaw) : null;
  if (linkedinRaw && !linkedinUrl) {
    return NextResponse.json(
      { error: "That LinkedIn link doesn't look right — paste the full profile URL, or just your handle." },
      { status: 400 },
    );
  }
  if (email && !isEmail(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  // The headshot is the whole point of collecting this by form rather
  // than by email, so it is required — but a speaker who genuinely has
  // none can still be entered by an admin afterwards.
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "Please attach a headshot." }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `Photo must be under 5 MB. Yours is ${(photo.size / 1024 / 1024).toFixed(1)} MB.` },
      { status: 400 },
    );
  }
  if (!ALLOWED_PHOTO_TYPES.has(photo.type)) {
    return NextResponse.json(
      { error: `Photo must be JPEG, PNG, or WebP. Yours is ${photo.type || "an unknown type"}.` },
      { status: 400 },
    );
  }

  const { randomUUID } = await import("crypto");
  const id = `cm${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const ext = photoExtFor(photo.type);
  // 128-bit token in the path: the bucket is publicly readable, so an
  // enumerable key would expose every speaker's photo before the
  // programme is announced.
  const photoKey = `speakers/${slug}/${id}.${ext}`;

  try {
    await putR2Object(photoKey, Buffer.from(await photo.arrayBuffer()), photo.type);
  } catch (err) {
    console.error("[speaker-intake] R2 upload failed:", err);
    return NextResponse.json({ error: "Photo upload failed. Try again." }, { status: 502 });
  }

  try {
    // Placed last in the running order; an admin reorders on the
    // programme rather than the speaker choosing their own billing.
    const last = await prisma.speaker.findFirst({
      where: { eventId: event.id },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });
    await prisma.speaker.create({
      data: {
        id,
        eventId: event.id,
        fullName: name,
        title: title || null,
        organization: organization || null,
        bio: bio || null,
        topics,
        linkedinUrl,
        sessionPitch: sessionPitch || null,
        contactEmail: email || null,
        photoUrl: r2PublicUrl(photoKey),
        submittedAt: new Date(),
        displayOrder: (last?.displayOrder ?? 0) + 1,
      },
    });
  } catch (err) {
    console.error("[speaker-intake] DB insert failed:", err);
    await deleteR2ObjectByUrl(photoKey).catch(() => {});
    return NextResponse.json({ error: "Couldn't save your details. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
