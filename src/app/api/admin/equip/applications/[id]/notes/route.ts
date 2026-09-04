/**
 * Reviewer-only notes pinned onto an application's attachments.
 *
 *   GET   /api/admin/equip/applications/[id]/notes            → all notes
 *   POST  /api/admin/equip/applications/[id]/notes            → add one
 *   PATCH /api/admin/equip/applications/[id]/notes { noteId } → edit / resolve
 *   DELETE .../notes?noteId=…                                 → remove
 *
 * Gated to the same people who can open the review page. Nothing here
 * is applicant-facing: the applicant's own thread is
 * EquipApplicationMessage (/api/equip/applications/[id]/messages), a
 * different table on purpose.
 *
 * Deliberately unowned. Any reviewer may edit, resolve, or delete any
 * note — this is a shared markup layer over one document, not a pile of
 * private annotations, and a second reviewer needs to be able to tidy up
 * after the first. authorName records who wrote it; it doesn't gate it.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import type { EquipDocument } from "@/lib/equip/types";

export const runtime = "nodejs";

const MAX_BODY = 2000;

async function reviewer() {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) return null;
  const u = session.user as { id?: string; name?: string | null; email?: string | null };
  return {
    id: u.id ?? null,
    name: (u.name ?? u.email ?? "A reviewer").trim() || "A reviewer",
  };
}

/** The note as the client consumes it — no author id, no internals. */
function shape(n: {
  id: string; documentKey: string; page: number; x: number; y: number;
  body: string; status: string; authorName: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: n.id,
    documentKey: n.documentKey,
    page: n.page,
    x: n.x,
    y: n.y,
    body: n.body,
    status: n.status,
    authorName: n.authorName,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await reviewer();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const notes = await prisma.equipDocumentNote.findMany({
    where: { applicationId: id },
    orderBy: [{ page: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ notes: notes.map(shape) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await reviewer();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    documentKey?: unknown; page?: unknown; x?: unknown; y?: unknown; body?: unknown;
  };

  const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_BODY) : "";
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  const documentKey = typeof body.documentKey === "string" ? body.documentKey : "";
  if (!documentKey) return NextResponse.json({ error: "Which attachment?" }, { status: 400 });

  // The key has to belong to THIS application. Without this an
  // authenticated reviewer could pin notes onto any R2 key they can
  // name, including another applicant's file.
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: { id: true, documents: true },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const docs = (app.documents as unknown as EquipDocument[]) ?? [];
  if (!docs.some((d) => d.key === documentKey)) {
    return NextResponse.json({ error: "That attachment isn't on this application." }, { status: 400 });
  }

  // Clamped rather than rejected: a pin dropped a hair outside the page
  // box (a fast drag at the edge) means the edge, not an error.
  const clamp = (v: unknown) => Math.min(1, Math.max(0, typeof v === "number" && Number.isFinite(v) ? v : 0));
  const page = typeof body.page === "number" && body.page >= 1 ? Math.floor(body.page) : 1;

  const note = await prisma.equipDocumentNote.create({
    data: {
      applicationId: id,
      documentKey,
      page,
      x: clamp(body.x),
      y: clamp(body.y),
      body: text,
      authorId: me.id,
      authorName: me.name,
    },
  });
  return NextResponse.json({ ok: true, note: shape(note) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await reviewer();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    noteId?: unknown; body?: unknown; status?: unknown;
  };
  const noteId = typeof body.noteId === "string" ? body.noteId : "";
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  const data: { body?: string; status?: string } = {};
  if (body.body !== undefined) {
    const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_BODY) : "";
    if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });
    data.body = text;
  }
  if (body.status !== undefined) {
    if (body.status !== "open" && body.status !== "resolved") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // applicationId in the where clause, not just the id: it scopes the
  // update to the application the caller actually addressed.
  const result = await prisma.equipDocumentNote.updateMany({
    where: { id: noteId, applicationId: id },
    data,
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const note = await prisma.equipDocumentNote.findUnique({ where: { id: noteId } });
  return NextResponse.json({ ok: true, note: note ? shape(note) : null });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await reviewer();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const noteId = new URL(req.url).searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  const result = await prisma.equipDocumentNote.deleteMany({
    where: { id: noteId, applicationId: id },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
