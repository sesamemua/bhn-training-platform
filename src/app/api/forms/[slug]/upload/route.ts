import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";
import type { FormField } from "@/lib/forms/types";
import { isFileField } from "@/lib/forms/types";

export const runtime = "nodejs";

const DEFAULT_MAX = 10 * 1024 * 1024; // 10 MB
const HARD_MAX = 50 * 1024 * 1024;    // 50 MB ceiling

/**
 * Upload a single file for a form field. Multipart/form-data POST with
 * `fieldId` and `file`. Validates against the form's schema (field
 * exists, type=file, accept matches, size under maxBytes), uploads to
 * R2, returns the public URL the client should put in submission data.
 *
 * SECURITY — keys include a random token so the URL is unguessable
 * --------------------------------------------------------------
 * The R2 bucket is publicly readable (no signed URLs). Earlier this
 * route used a key like `form-uploads/{slug}/{userId}/{ts}_{file}`,
 * which is enumerable: form slugs are public, userIds leak in
 * authenticated lists (employer applicant view, buddy search), and
 * the millisecond timestamp is a small brute-force window. An
 * attacker with a userId could probe a few thousand timestamps and
 * fetch arbitrary form-submission files — same authorization-
 * boundary failure that drove the May-2026 Canvas / Instructure
 * incident. The new key includes a 128-bit random token, so the URL
 * is computationally infeasible to construct without our DB.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 500 });
  }

  const { slug } = await params;
  const form = await prisma.eventForm.findUnique({ where: { slug } });
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  if (!form.active) {
    return NextResponse.json({ error: "Form is not accepting submissions." }, { status: 410 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
  }
  const fieldId = formData.get("fieldId");
  const file = formData.get("file");
  if (typeof fieldId !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "fieldId and file are required." }, { status: 400 });
  }

  // Validate the field exists and is a file field on the form's schema.
  const fields = form.fields as unknown as FormField[];
  const field = fields.find((f) => f.id === fieldId);
  if (!field || !isFileField(field)) {
    return NextResponse.json({ error: "Unknown file field." }, { status: 400 });
  }
  const max = Math.min(field.maxBytes ?? DEFAULT_MAX, HARD_MAX);
  if (file.size > max) {
    return NextResponse.json(
      { error: `File is ${(file.size / 1_048_576).toFixed(1)} MB; max is ${(max / 1_048_576).toFixed(0)} MB.` },
      { status: 413 }
    );
  }
  // Loose accept check — exact pattern matching is the field-input's job.
  if (field.accept && file.type) {
    const ok = field.accept.split(",").some((tok) => {
      const t = tok.trim();
      if (!t) return false;
      if (t.startsWith(".")) return file.name.toLowerCase().endsWith(t.toLowerCase());
      if (t.endsWith("/*")) return file.type.startsWith(t.slice(0, -1));
      return file.type === t;
    });
    if (!ok) {
      return NextResponse.json(
        { error: `Wrong file type. Expected ${field.accept}.` },
        { status: 415 }
      );
    }
  }

  const userId = (session.user as { id?: string }).id ?? "anon";
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  // 128-bit random token makes the path unguessable even when the
  // attacker knows the form slug and userId.
  const token = randomBytes(16).toString("hex");
  const key = `form-uploads/${form.slug}/${userId}/${token}/${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await putR2Object(key, buf, file.type || "application/octet-stream");
  const url = r2PublicUrl(key);

  return NextResponse.json({ url, name: file.name, size: file.size });
}
