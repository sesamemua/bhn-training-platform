/**
 * Trainee "My Application" file upload. Multipart POST with
 *   kind: "resume" | "video"
 *   file: File
 * Validates type + size, writes to R2 at a path that includes a
 * cryptographic token, and patches the user row so the URL is
 * immediately available to GET /api/profile/application without a
 * second round-trip.
 *
 * Resume: PDF/DOCX, ≤ 10 MB.
 * Video : MP4/MOV/WebM, ≤ 60 MB. (1-min introductions are tiny when
 *         encoded sensibly. 60 MB gives breathing room for phone H.264
 *         and prevents hour-long uploads from sneaking in.)
 *
 * SECURITY — why the path now includes a random token
 * ----------------------------------------------------
 * The R2 bucket is publicly readable (no signed URLs). Earlier this
 * route used a deterministic key like `applications/{userId}/resume.pdf`,
 * which meant anyone who learned a userId (e.g. from an authenticated
 * employer applicant list) could construct the URL and download that
 * trainee's resume + 1-minute video without ever touching a BHN API.
 * The userId by itself was effectively an authorisation token, which
 * is exactly the failure class behind the May-2026 Canvas / Instructure
 * breach (low-privilege authenticated account → other tenants' data).
 *
 * Now: each upload picks a fresh 128-bit random token and writes to
 *   applications/{userId}/{token}/{kind}.{ext}
 * Knowing the userId is not enough — an attacker also needs the token,
 * which is only ever returned in the authenticated PATCH/GET response
 * to the file's owner (and to anyone the owner deliberately shares the
 * URL with, e.g. via a talent-application submission). Re-uploading
 * generates a new token and best-effort deletes the previous object
 * so storage doesn't leak.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putR2Object, r2PublicUrl, deleteR2ObjectByUrl, R2_PUBLIC_URL } from "@/lib/r2";

export const runtime = "nodejs";

const RESUME_MAX = 10 * 1024 * 1024; // 10 MB
const VIDEO_MAX  = 60 * 1024 * 1024; // 60 MB

const RESUME_EXT_OK = new Set(["pdf", "docx"]);
const VIDEO_EXT_OK  = new Set(["mp4", "mov", "webm", "m4v"]);

async function meId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const u = await prisma.user.findUnique({
    where: { email: session.user.email }, select: { id: true },
  });
  return u?.id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await meId();
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (kind !== "resume" && kind !== "video") {
    return NextResponse.json({ error: "kind must be 'resume' or 'video'." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const max = kind === "resume" ? RESUME_MAX : VIDEO_MAX;
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 });
  }
  if (file.size > max) {
    return NextResponse.json(
      { error: `File is ${(file.size / 1_048_576).toFixed(1)} MB; max is ${(max / 1_048_576).toFixed(0)} MB.` },
      { status: 413 }
    );
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const allow = kind === "resume" ? RESUME_EXT_OK : VIDEO_EXT_OK;
  if (!allow.has(ext)) {
    return NextResponse.json(
      { error: kind === "resume"
          ? "Resume must be PDF or DOCX."
          : "Video must be MP4, MOV, WebM, or M4V." },
      { status: 415 }
    );
  }

  // 128-bit random token. Hex (32 chars) is a touch longer than
  // base64url but easier to recognise in logs and CDN paths.
  const token = randomBytes(16).toString("hex");
  const key = `applications/${userId}/${token}/${kind}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const contentType = file.type
    || (kind === "resume"
        ? (ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        : (ext === "mp4" || ext === "m4v" ? "video/mp4" : ext === "mov" ? "video/quicktime" : "video/webm"));

  // Look up the current URL so we can delete the previous object on
  // success (best-effort; failure to delete doesn't break the upload).
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { resumeUrl: true, videoIntroUrl: true },
  });
  const previousUrl = kind === "resume" ? before?.resumeUrl : before?.videoIntroUrl;

  await putR2Object(key, buf, contentType);
  const url = r2PublicUrl(key);

  const field = kind === "resume" ? "resumeUrl" : "videoIntroUrl";
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { [field]: url, applicationUpdatedAt: new Date() },
    select: { resumeUrl: true, videoIntroUrl: true, applicationUpdatedAt: true },
  });

  // Now that the new URL is the canonical one in the DB, delete the
  // previous object. We do this *after* the DB update so a worst-case
  // crash leaves the user with a still-readable old file rather than a
  // dangling DB pointer to a deleted object.
  if (previousUrl && previousUrl !== url) {
    void deleteR2ObjectByUrl(previousUrl);
  }

  return NextResponse.json({ url, ...updated });
}
