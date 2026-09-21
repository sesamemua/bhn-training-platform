/**
 * POST /api/showcase/submit
 *
 * PUBLIC endpoint (no auth) — accepts a graduate showcase
 * submission: name + linkedin handle + headshot file. Validates,
 * uploads the photo to R2, persists a ShowcaseSubmission row.
 *
 * Body: multipart/form-data with fields:
 *   programSlug  string (default "regulatory-affairs")
 *   name         string (required, 2-120 chars)
 *   linkedin     string (required, 2-200 chars — raw user input,
 *                normalised to a canonical URL server-side)
 *   photo        File   (image/* under 5 MB) — required UNLESS reuseFromId
 *                is provided (returning person reusing a saved photo).
 *   reuseFromId  string (optional) — id of the person's previous
 *                submission; its photo is copied server-side so they don't
 *                re-upload. Guarded: that row's name must match the
 *                submitted name.
 *
 * Returns: { ok: true, id } on success, { error } on failure.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";
import { MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, normaliseLinkedin } from "@/lib/showcase/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!R2_PUBLIC_URL) {
    return NextResponse.json(
      { error: "Server isn't configured to accept uploads. Contact us." },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't parse form data." }, { status: 400 });
  }

  const programSlug = String(formData.get("programSlug") ?? "regulatory-affairs").trim();
  const name = String(formData.get("name") ?? "").trim();
  const linkedinRaw = String(formData.get("linkedin") ?? "").trim();
  const photo = formData.get("photo");
  const reuseFromId = String(formData.get("reuseFromId") ?? "").trim() || null;

  // Validate text fields. The slug must be a real, open showcase group
  // (the seeded Regulatory Affairs group, or any an admin created in
  // /admin/showcase).
  const group = await prisma.showcaseGroup.findUnique({
    where: { slug: programSlug },
    select: { id: true, active: true, gateOnAttendance: true, linkedCohortId: true },
  });
  if (!group) {
    return NextResponse.json({ error: "Unknown showcase." }, { status: 400 });
  }
  if (!group.active) {
    return NextResponse.json(
      { error: "This showcase isn't accepting submissions right now." },
      { status: 400 },
    );
  }

  // Attendance gate — enforced HERE regardless of what the client sends.
  // A bound + gated cohort accepts submissions only from a signed-in trainee
  // with an approved/completed enrollment in the bound cohort who is marked
  // attended. The trainee's User id is stamped on the row.
  let gatedUserId: string | null = null;
  if (group.gateOnAttendance && group.linkedCohortId) {
    const session = await getSession();
    const userId = session
      ? ((session.user as { id?: string }).id ?? null)
      : null;
    if (!userId) {
      return NextResponse.json(
        { error: "Sign in to submit to this showcase." },
        { status: 401 },
      );
    }
    const enr = await prisma.pathwayEnrollment.findFirst({
      where: {
        userId,
        cohortId: group.linkedCohortId,
        status: { in: ["approved", "completed"] },
      },
      select: { attended: true },
    });
    if (!enr || !enr.attended) {
      return NextResponse.json(
        { error: "Only registered trainees who attended this cohort can submit." },
        { status: 403 },
      );
    }
    gatedUserId = userId;
  }
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Name should be 2–120 characters." }, { status: 400 });
  }
  if (linkedinRaw.length < 2 || linkedinRaw.length > 200) {
    return NextResponse.json({ error: "Add your LinkedIn handle (2–200 characters)." }, { status: 400 });
  }
  const linkedinUrl = normaliseLinkedin(linkedinRaw);
  if (!linkedinUrl) {
    return NextResponse.json({
      error: "That LinkedIn handle doesn't look right. Try a URL like linkedin.com/in/yourname or just the slug 'yourname'.",
    }, { status: 400 });
  }

  // The id doubles as the R2 key so each photo URL is stable + findable.
  const { randomUUID } = await import("crypto");
  const id = `cm${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  // Resolve the photo bytes: a freshly uploaded file, or — for a
  // returning person whose typed name matched a previous entry — a
  // server-side copy of that entry's photo (so they don't re-upload and
  // each row still owns its own object). A new upload always wins.
  let buf: Buffer;
  let contentType: string;
  let ext: string;

  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: `Photo must be under 5 MB. Yours is ${(photo.size / 1024 / 1024).toFixed(1)} MB.` }, { status: 400 });
    }
    if (!ALLOWED_PHOTO_TYPES.has(photo.type)) {
      return NextResponse.json({ error: `Photo must be JPEG, PNG, or WebP. Yours is ${photo.type || "an unknown type"}.` }, { status: 400 });
    }
    buf = Buffer.from(await photo.arrayBuffer());
    contentType = photo.type;
    ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  } else if (reuseFromId) {
    // Reuse a returning person's saved photo. Guard against grabbing
    // someone else's image: the source row's name must match the name
    // being submitted (the lookup that surfaced it was exact-name too).
    const src = await prisma.showcaseSubmission.findUnique({
      where: { id: reuseFromId },
      select: { name: true, photoUrl: true, photoKey: true },
    });
    if (!src || src.name.trim().toLowerCase() !== name.toLowerCase()) {
      return NextResponse.json(
        { error: "Couldn't reuse your previous photo — please upload one." },
        { status: 400 },
      );
    }
    try {
      const r = await fetch(src.photoUrl);
      if (!r.ok) throw new Error(`fetch ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (err) {
      console.error("[showcase] reuse photo fetch failed:", err);
      return NextResponse.json(
        { error: "Couldn't reuse your previous photo — please upload one." },
        { status: 400 },
      );
    }
    if (buf.length === 0 || buf.length > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "Couldn't reuse your previous photo — please upload one." },
        { status: 400 },
      );
    }
    const m = src.photoKey.match(/\.([a-z0-9]+)$/i);
    ext = (m?.[1] ?? "jpg").toLowerCase();
    contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  } else {
    return NextResponse.json({ error: "Headshot file is required." }, { status: 400 });
  }

  const photoKey = `showcase/${programSlug}/${id}.${ext}`;
  try {
    await putR2Object(photoKey, buf, contentType);
  } catch (err) {
    console.error("[showcase] R2 upload failed:", err);
    return NextResponse.json({ error: "Photo upload failed. Try again." }, { status: 502 });
  }

  // Capture IP + UA for abuse triage. Vercel injects the real
  // origin IP into x-forwarded-for / x-real-ip headers.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = (xff.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || null;
  const ua = req.headers.get("user-agent");

  try {
    await prisma.showcaseSubmission.create({
      data: {
        id,
        programSlug,
        name,
        linkedinHandle: linkedinRaw,
        linkedinUrl,
        photoUrl: r2PublicUrl(photoKey),
        photoKey,
        submittedFromIp: ip,
        submittedFromUa: ua,
        userId: gatedUserId,
        // Home membership — single source of truth for this person's group.
        memberships: { create: { groupId: group.id, isHome: true } },
      },
    });
  } catch (err) {
    console.error("[showcase] DB insert failed:", err);
    // Best-effort: try to clean up the uploaded photo so we don't
    // leak orphaned objects. Ignored on error.
    try {
      const { deleteR2ObjectByUrl } = await import("@/lib/r2");
      await deleteR2ObjectByUrl(photoKey);
    } catch { /* swallow */ }
    return NextResponse.json({ error: "Couldn't save your submission. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
