/**
 * Document upload / get / delete for an EquipApplication.
 *
 *   POST   /api/equip/applications/[id]/document  → multipart upload
 *   GET    /api/equip/applications/[id]/document?key=...
 *                                                  → stream the file
 *   DELETE /api/equip/applications/[id]/document?key=...
 *                                                  → remove (only
 *                                                    while draft)
 *
 * Stores files under
 *   equip/{applicationId}/{kind}/{token}/{safeName}
 * in R2. Records a row in the application's `documents` JSON
 * array. Mirrors the CreditApplication pattern — same shape,
 * same auth posture.
 *
 * The applicant owns their drafts; once submitted, only the
 * reviewer (admin) can DELETE.
 */
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET, putR2Object } from "@/lib/r2";
import type { EquipDocument } from "@/lib/equip/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_KINDS = [
  // Stage-1 / pitch material
  "pitch_deck", "prototype_photo", "letter", "video_pitch",
  // VL Stage-2 appendix kinds — match the lib/equip/types.ts
  // EquipDocument["kind"] union exactly.
  "cv", "support_letter", "ip_doc",
  "other",
] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

async function loadOwnedOrAdmin(id: string, session: Awaited<ReturnType<typeof getSession>>): Promise<{ app: { id: string; userId: string; status: string; documents: EquipDocument[] }; isAdmin: boolean } | null> {
  if (!session) return null;
  const userId = (session.user as { id?: string }).id;
  const role = (session.user as { role?: string }).role ?? "";
  const isAdmin = role === "admin" || role === "superadmin";
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true, documents: true },
  });
  if (!app) return null;
  if (!isAdmin && app.userId !== userId) return null;
  return {
    app: { id: app.id, userId: app.userId ?? "", status: app.status, documents: (app.documents as unknown as EquipDocument[]) ?? [] },
    isAdmin,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2) return NextResponse.json({ error: "R2 not configured" }, { status: 503 });

  const { id } = await params;
  const auth = await loadOwnedOrAdmin(id, session);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only applicant can upload, and only while draft.
  if (auth.isAdmin && !auth.app.userId) {
    return NextResponse.json({ error: "Cannot upload as admin" }, { status: 403 });
  }
  if (auth.app.status !== "draft") {
    return NextResponse.json({ error: "Application is locked" }, { status: 409 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = (form.get("kind") as string | null) ?? "other";
  const kind = (ALLOWED_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as Kind) : "other";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large — max ${Math.round(MAX_BYTES / 1024 / 1024)} MB` }, { status: 413 });
  }

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  const token = randomBytes(12).toString("hex");
  const key = `equip/${id}/${kind}/${token}/${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await putR2Object(key, buf, file.type || "application/octet-stream");

  const doc: EquipDocument = {
    key,
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
    kind,
    uploadedAt: new Date().toISOString(),
  };
  const nextDocs = [...auth.app.documents, doc];
  await prisma.equipApplication.update({
    where: { id },
    data: { documents: nextDocs as unknown as object },
  });

  return NextResponse.json({ ok: true, document: doc });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!r2) return new NextResponse("R2 not configured", { status: 503 });

  const { id } = await params;
  const auth = await loadOwnedOrAdmin(id, session);
  if (!auth) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return new NextResponse("key required", { status: 400 });
  const doc = auth.app.documents.find((d) => d.key === key);
  if (!doc) return new NextResponse("Not in application", { status: 404 });

  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (!res.Body) return new NextResponse("Empty", { status: 404 });
    const body = res.Body as Readable;
    const webStream = Readable.toWeb(body) as unknown as ReadableStream;
    return new NextResponse(webStream, {
      headers: {
        "Content-Type": doc.contentType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const auth = await loadOwnedOrAdmin(id, session);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  // Only the applicant (in draft) or an admin can delete. Once
  // submitted, the applicant loses delete rights — admins can still
  // tidy up if a doc is irrelevant.
  if (!auth.isAdmin && auth.app.status !== "draft") {
    return NextResponse.json({ error: "Locked" }, { status: 409 });
  }

  const next = auth.app.documents.filter((d) => d.key !== key);
  await prisma.equipApplication.update({
    where: { id },
    data: { documents: next as unknown as object },
  });
  return NextResponse.json({ ok: true, removed: key });
}
