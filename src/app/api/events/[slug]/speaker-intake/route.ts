/**
 * POST /api/events/[slug]/speaker-intake
 *
 * PUBLIC (no auth) — a guest speaker or panellist submits their own
 * details for the event website: headshot, name, title, organisation,
 * session title, bio, topics.
 *
 * Modelled on /api/showcase/submit, which solves the same problem for
 * graduates: a person outside the platform needs to hand us a photo and
 * a few fields without an account. Same R2 upload, same validation
 * helpers, same abuse capture. It differs in the gate — an event opens
 * intake explicitly (`speakerIntakeOpen`) rather than per submission
 * group, and every row lands as a draft for an admin to place on the
 * programme.
 *
 * Body: multipart/form-data — name, title, organization, sessionTitle,
 * bio, topics (comma separated), email, photo (image/*, <5MB).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL, deleteR2ObjectByUrl } from "@/lib/r2";
import { MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, photoExtFor } from "@/lib/showcase/validation";
import { countWords } from "@/lib/events/bio";
import { speakerLimits, maxCharsFor } from "@/lib/events/limits";
import { sendMail, mailConfigured } from "@/lib/mail";
import {
  speakerSubmissionEmail,
  SPEAKER_SUBMISSION_RECIPIENTS,
} from "@/lib/notify/speaker-submission";

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
    select: {
      id: true,
      title: true,
      speakerIntakeOpen: true,
      speakerBioMaxWords: true,
      speakerPitchMaxWords: true,
    },
  });
  if (!event) return NextResponse.json({ error: "Unknown event." }, { status: 404 });
  // Resolved once, from the event, and used by every check below.
  const limits = speakerLimits(event);

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
  const sessionTitle = String(form.get("sessionTitle") ?? "").trim();
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
  // Mandatory as of the organisers' request: a speaker card with no role
  // or employer reads as unfinished on the programme page.
  if (title.length < 2) {
    return NextResponse.json({ error: "Please give your title or role." }, { status: 400 });
  }
  if (organization.length < 2) {
    return NextResponse.json({ error: "Please give your company." }, { status: 400 });
  }
  if (title.length > 160) {
    return NextResponse.json({ error: "Title is a little long — keep it under 160 characters." }, { status: 400 });
  }
  if (organization.length > 160) {
    return NextResponse.json({ error: "Organisation is a little long — keep it under 160 characters." }, { status: 400 });
  }
  if (sessionTitle.length > 200) {
    return NextResponse.json({ error: "Session title is a little long — keep it under 200 characters." }, { status: 400 });
  }
  // Hard-capped at the same limit the form counts down to, so a pasted
  // bio cannot slip past the counter. Counted in words, like the counter.
  // Cheap length check first — countWords allocates, and this is public.
  if (bio.length > maxCharsFor(limits.bio)) {
    return NextResponse.json({ error: "That bio is far too long." }, { status: 413 });
  }
  const bioWords = countWords(bio);
  if (bioWords === 0) {
    return NextResponse.json({ error: "Please give a speaker biography." }, { status: 400 });
  }
  if (bioWords > limits.bio) {
    return NextResponse.json(
      { error: `Keep the bio to ${limits.bio} words or fewer — yours is ${bioWords}.` },
      { status: 400 },
    );
  }
  // Character backstop first — countWords tokenizes the input, and this
  // endpoint is public. Then the real rule, in the same unit the form
  // counts down in.
  if (sessionPitch.length > maxCharsFor(limits.pitch)) {
    return NextResponse.json({ error: "That's longer than I can work with." }, { status: 413 });
  }
  const pitchWords = countWords(sessionPitch);
  if (pitchWords > limits.pitch) {
    return NextResponse.json(
      { error: `Keep the session description to ${limits.pitch} words — yours is ${pitchWords}.` },
      { status: 400 },
    );
  }

  // Accepts a full URL or a bare handle; stored canonical or not at all.
  // Length before parsing, like every other field on this route and
  // like the sibling callers. The value is not parsed here any more,
  // but an unbounded field on a public endpoint is still a field
  // somebody can post a megabyte into.
  if (linkedinRaw.length > 200) {
    return NextResponse.json({ error: "That LinkedIn link is too long." }, { status: 400 });
  }
  /*
   * Stored as typed. Optional, and not checked.
   *
   * It used to be normalised and refused when it could not be parsed,
   * which kept meeting real profiles the parser had not been taught
   * about — a handle beginning with a Canadian flag was the last one.
   * Every round of that spent a speaker's goodwill to protect a field
   * nobody computes on: it is read by a human and pasted onto a
   * website. A wrong link is a wrong link whether or not we parsed it,
   * and an admin can fix it in the roster in seconds.
   */
  const linkedinUrl = linkedinRaw || null;
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
        sessionTitle: sessionTitle || null,
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

  /*
   * A copy to the coordinators, after the row is safely saved.
   *
   * Deliberately outside the try/catch above and unable to fail the
   * request: the speaker has already given us everything, and telling
   * them "couldn't save your details" because our mail server was
   * having a moment would make them do it all again for nothing. A
   * missed copy costs somebody opening the admin page; a false failure
   * costs the submission.
   */
  if (mailConfigured()) {
    const mail = speakerSubmissionEmail({
      eventTitle: event.title,
      slug,
      fullName: name,
      title: title || null,
      organization: organization || null,
      bio: bio || null,
      linkedinUrl,
      sessionTitle: sessionTitle || null,
      sessionPitch: sessionPitch || null,
      photoUrl: r2PublicUrl(photoKey),
    });
    const [to, ...cc] = SPEAKER_SUBMISSION_RECIPIENTS;
    // A real cc, not a second send — each of them should be able to see
    // the other already has it, so neither chases the same speaker twice.
    await sendMail({ to, cc: [...cc], subject: mail.subject, text: mail.text, html: mail.html })
      .catch((err) => console.error("[speaker-intake] submission copy failed:", err));
  }

  return NextResponse.json({ ok: true });
}
