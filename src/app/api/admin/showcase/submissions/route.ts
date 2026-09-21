/**
 * POST /api/admin/showcase/submissions
 *
 * Admin-only. Manually creates a ShowcaseSubmission for a specific
 * showcase group/cohort — the admin-side counterpart to the public
 * /api/showcase/submit route. Bypasses the group's `active` flag and
 * the attendance gate entirely: this IS the override for people an
 * admin wants on the roster who didn't (or can't) go through the
 * public form — e.g. entering names off a printed sign-in sheet.
 *
 * Body: multipart/form-data —
 *   programSlug  string (required) — an existing ShowcaseGroup slug
 *   name         string (required, 2-120 chars)
 *   linkedin     string (required, 2-200 chars)
 *   photo        File   (image/*, <5MB — required)
 *   note         string (optional) — appended to the audit adminNote
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL, deleteR2ObjectByUrl } from "@/lib/r2";
import { MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, normaliseLinkedin, photoExtFor } from "@/lib/showcase/validation";

export const runtime = "nodejs";

/**
 * GET /api/admin/showcase/submissions?slug=<groupSlug>
 * Admin-only. Returns the people (submissions) in one showcase group, newest
 * first — powers the in-context roster + per-person remove in the manager.
 */
export async function GET(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim();
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const group = await prisma.showcaseGroup.findUnique({ where: { slug }, select: { id: true } });
  if (!group) return NextResponse.json({ people: [] });
  // Roster = membership rows for this group (single source of truth), each
  // joined to its person. membershipId lets the roster remove-from-group
  // without hard-deleting the person; isHome flags the person's home group.
  const rows = await prisma.showcaseMembership.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      isHome: true,
      submission: { select: { id: true, name: true, linkedinUrl: true, linkedinHandle: true, photoUrl: true, createdAt: true } },
    },
  });
  return NextResponse.json({
    people: rows.map((m) => ({
      id: m.submission.id,
      membershipId: m.id,
      isHome: m.isHome,
      name: m.submission.name,
      linkedin: m.submission.linkedinUrl ?? m.submission.linkedinHandle,
      photoUrl: m.submission.photoUrl,
      createdAt: m.submission.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 500 });
  }
  const adminName =
    (session.user as { name?: string }).name ??
    (session.user as { email?: string }).email ??
    "Admin";

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }

  const programSlug = String(formData.get("programSlug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const linkedinRaw = String(formData.get("linkedin") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const photo = formData.get("photo");

  const group = await prisma.showcaseGroup.findUnique({ where: { slug: programSlug }, select: { id: true, slug: true } });
  if (!group) return NextResponse.json({ error: "Unknown showcase cohort." }, { status: 400 });

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Name should be 2–120 characters." }, { status: 400 });
  }
  if (linkedinRaw.length < 2 || linkedinRaw.length > 200) {
    return NextResponse.json({ error: "Add a LinkedIn handle (2–200 characters)." }, { status: 400 });
  }
  const linkedinUrl = normaliseLinkedin(linkedinRaw);
  if (!linkedinUrl) {
    return NextResponse.json(
      { error: "That LinkedIn handle doesn't look right. Try a URL like linkedin.com/in/yourname or just the slug 'yourname'." },
      { status: 400 },
    );
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "A headshot photo is required." }, { status: 400 });
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
  const buf = Buffer.from(await photo.arrayBuffer());
  const ext = photoExtFor(photo.type);
  const photoKey = `showcase/${programSlug}/${id}.${ext}`;

  try {
    await putR2Object(photoKey, buf, photo.type);
  } catch (err) {
    console.error("[admin showcase] R2 upload failed:", err);
    return NextResponse.json({ error: "Photo upload failed. Try again." }, { status: 502 });
  }

  const adminNote = note ? `Added manually by ${adminName} — ${note}` : `Added manually by ${adminName}`;

  try {
    const created = await prisma.showcaseSubmission.create({
      data: {
        id,
        programSlug,
        name,
        linkedinHandle: linkedinRaw,
        linkedinUrl,
        photoUrl: r2PublicUrl(photoKey),
        photoKey,
        adminNote,
        // Home membership — the single-source-of-truth row for this
        // person's group. Written atomically with the submission.
        memberships: { create: { groupId: group.id, isHome: true } },
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[admin showcase] DB insert failed:", err);
    await deleteR2ObjectByUrl(photoKey).catch(() => {});
    return NextResponse.json({ error: "Couldn't save the submission. Try again." }, { status: 500 });
  }
}
