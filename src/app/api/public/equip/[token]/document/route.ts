import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl, putR2Object, r2 } from "@/lib/r2";
import {
  validatePublicEquipDocumentUpload,
  type PublicEquipDocumentKind,
} from "@/lib/equip/public-document-upload";
import type { EquipDocument } from "@/lib/equip/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadPublicApplication(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.equipApplication.findUnique({
    where: { publicToken: token },
    select: { id: true, status: true, documents: true },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!r2) return NextResponse.json({ error: "File storage is unavailable." }, { status: 503 });

  const { token } = await params;
  const app = await loadPublicApplication(token);
  if (!app) return NextResponse.json({ error: "This application link is no longer active." }, { status: 404 });
  if (app.status !== "draft") {
    return NextResponse.json({ error: "This application is locked." }, { status: 409 });
  }

  const documents = (app.documents as unknown as EquipDocument[]) ?? [];
  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });
  }

  const error = validatePublicEquipDocumentUpload({
    kind,
    name: file.name,
    size: file.size,
    contentType: file.type,
    existingDocuments: documents,
  });
  if (error) return NextResponse.json({ error }, { status: 400 });

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "attachment";
  const key = `equip/${app.id}/${kind}/${randomBytes(12).toString("hex")}/${safeName}`;
  await putR2Object(
    key,
    Buffer.from(await file.arrayBuffer()),
    file.type || "application/octet-stream",
  );

  const document: EquipDocument = {
    key,
    name: file.name,
    size: file.size,
    contentType: file.type || "application/octet-stream",
    kind: kind as PublicEquipDocumentKind,
    uploadedAt: new Date().toISOString(),
  };
  await prisma.equipApplication.update({
    where: { id: app.id },
    data: { documents: [...documents, document] as unknown as object },
  });

  return NextResponse.json({ ok: true, document });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const app = await loadPublicApplication(token);
  if (!app) return NextResponse.json({ error: "This application link is no longer active." }, { status: 404 });
  if (app.status !== "draft") {
    return NextResponse.json({ error: "This application is locked." }, { status: 409 });
  }

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Attachment key required." }, { status: 400 });
  const documents = (app.documents as unknown as EquipDocument[]) ?? [];
  if (!documents.some((document) => document.key === key)) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  await prisma.equipApplication.update({
    where: { id: app.id },
    data: { documents: documents.filter((document) => document.key !== key) as unknown as object },
  });
  await deleteR2ObjectByUrl(key);
  return NextResponse.json({ ok: true, removed: key });
}
