/**
 * Reviewing a block of pasted code.
 *
 *   GET    ?id=…        one review, with its notes re-anchored to the
 *                       code as it stands now
 *   GET                 the open reviews
 *   POST                start one from a paste
 *   PUT                 replace the code (a new round) and re-anchor
 *   PATCH               add a note, edit one, resolve one
 *   DELETE ?id=…        remove a review, or ?noteId=… one note
 *
 * The code is only ever stored and returned as text. Nothing here
 * renders it, which is what makes a paste from anybody's campaign
 * export safe to keep.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeAnchor, locate, splitLines, type Anchor } from "@/lib/codereview/anchor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A Mailchimp export is large; this is not a file store. */
export const MAX_CODE_CHARS = 1_000_000;
export const MAX_LINES = 20_000;
const MAX_TITLE = 160;
const MAX_BODY = 4_000;

const KINDS = new Set(["html", "json", "text"]);

async function staff() {
  try {
    const s = await requireRole("instructor");
    return s.user as { id?: string; name?: string; email?: string };
  } catch {
    return null;
  }
}
const DENIED = () =>
  NextResponse.json({ error: "You need to be signed in as staff." }, { status: 403 });

const NOTE_SELECT = {
  id: true, round: true, body: true, status: true,
  anchorText: true, anchorLine: true, anchorBefore: true, anchorAfter: true, anchorState: true,
  authorName: true, createdAt: true, updatedAt: true,
} as const;

const anchorOf = (n: {
  anchorLine: number; anchorText: string; anchorBefore: string | null; anchorAfter: string | null;
}): Anchor => ({
  line: n.anchorLine,
  lineText: n.anchorText,
  // NULL in the database means "there was nothing there", which the
  // matcher treats as a value. undefined is how it spells that.
  before: n.anchorBefore ?? undefined,
  after: n.anchorAfter ?? undefined,
});

/** Where every note sits in the code as it stands now. */
function withPositions(code: string, notes: { anchorLine: number; anchorText: string; anchorBefore: string | null; anchorAfter: string | null }[]) {
  return notes.map((n) => locate(anchorOf(n), code));
}

export async function GET(req: NextRequest) {
  const me = await staff();
  if (!me) return DENIED();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    const reviews = await prisma.codeReview.findMany({
      where: { status: "open" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true, title: true, kind: true, round: true, updatedAt: true,
        _count: { select: { notes: true } },
      },
    });
    return NextResponse.json({ ok: true, reviews });
  }

  const review = await prisma.codeReview.findUnique({
    where: { id },
    include: { notes: { select: NOTE_SELECT, orderBy: { createdAt: "asc" } } },
  });
  if (!review) return NextResponse.json({ error: "No such review." }, { status: 404 });

  const located = withPositions(review.code, review.notes);
  return NextResponse.json({
    ok: true,
    review: {
      ...review,
      lines: splitLines(review.code).length,
      notes: review.notes.map((n, i) => ({ ...n, located: located[i] })),
    },
  });
}

export async function POST(req: NextRequest) {
  const me = await staff();
  if (!me) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? "");
  const title = String(body.title ?? "").trim().slice(0, MAX_TITLE) || "Untitled paste";
  const kind = KINDS.has(String(body.kind)) ? String(body.kind) : "html";

  if (!code.trim()) return NextResponse.json({ error: "Paste something first." }, { status: 400 });
  if (code.length > MAX_CODE_CHARS) {
    return NextResponse.json({ error: "That paste is larger than this can hold." }, { status: 413 });
  }
  if (splitLines(code).length > MAX_LINES) {
    return NextResponse.json({ error: `More than ${MAX_LINES} lines — too long to review here.` }, { status: 413 });
  }

  const review = await prisma.codeReview.create({
    data: { title, kind, code, createdById: me.id ?? null },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: review.id });
}

/** Replace the code — a new round. Notes are kept and re-anchored. */
export async function PUT(req: NextRequest) {
  const me = await staff();
  if (!me) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const code = String(body.code ?? "");
  if (!id) return NextResponse.json({ error: "Which review?" }, { status: 400 });
  if (!code.trim()) return NextResponse.json({ error: "Paste something first." }, { status: 400 });
  if (code.length > MAX_CODE_CHARS || splitLines(code).length > MAX_LINES) {
    return NextResponse.json({ error: "That paste is too large." }, { status: 413 });
  }

  const existing = await prisma.codeReview.findUnique({
    where: { id },
    include: { notes: { select: { id: true, anchorLine: true, anchorText: true, anchorBefore: true, anchorAfter: true } } },
  });
  if (!existing) return NextResponse.json({ error: "No such review." }, { status: 404 });

  /*
   * Every note is re-anchored against the new paste and its recorded
   * line MOVES with it. A note whose line is gone is marked orphaned
   * and kept — deleting somebody's note is not this endpoint's
   * decision, and pinning it to a line that happens to be nearby is
   * worse than admitting it is lost.
   */
  const round = existing.round + 1;
  await prisma.$transaction([
    prisma.codeReview.update({ where: { id }, data: { code, round } }),
    ...existing.notes.map((n) => {
      const found = locate(anchorOf(n), code);
      return prisma.codeReviewNote.update({
        where: { id: n.id },
        data: {
          anchorState: found.kind,
          ...(found.line !== null ? { anchorLine: found.line } : {}),
        },
      });
    }),
  ]);

  return NextResponse.json({ ok: true, round });
}

export async function PATCH(req: NextRequest) {
  const me = await staff();
  if (!me) return DENIED();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "addNote") {
    const reviewId = String(body.reviewId ?? "");
    const line = Number(body.line);
    const text = String(body.body ?? "").trim().slice(0, MAX_BODY);
    if (!text) return NextResponse.json({ error: "Write the note first." }, { status: 400 });

    const review = await prisma.codeReview.findUnique({
      where: { id: reviewId },
      select: { code: true, round: true },
    });
    if (!review) return NextResponse.json({ error: "No such review." }, { status: 404 });

    const anchor = makeAnchor(review.code, line);
    if (!anchor) return NextResponse.json({ error: "That line is not in this paste." }, { status: 400 });

    const note = await prisma.codeReviewNote.create({
      data: {
        reviewId, round: review.round, body: text,
        anchorText: anchor.lineText, anchorLine: anchor.line,
        anchorBefore: anchor.before ?? null, anchorAfter: anchor.after ?? null,
        authorId: me.id ?? null,
        authorName: me.name ?? me.email ?? "Someone",
      },
      select: NOTE_SELECT,
    });
    return NextResponse.json({ ok: true, note });
  }

  if (action === "setNoteStatus" || action === "editNote") {
    const noteId = String(body.noteId ?? "");
    if (!noteId) return NextResponse.json({ error: "Which note?" }, { status: 400 });
    const data =
      action === "setNoteStatus"
        ? { status: body.status === "resolved" ? "resolved" : "open" }
        : { body: String(body.body ?? "").trim().slice(0, MAX_BODY) };
    if ("body" in data && !data.body) {
      return NextResponse.json({ error: "A note cannot be empty." }, { status: 400 });
    }
    const note = await prisma.codeReviewNote
      .update({ where: { id: noteId }, data, select: NOTE_SELECT })
      .catch(() => null);
    if (!note) return NextResponse.json({ error: "No such note." }, { status: 404 });
    return NextResponse.json({ ok: true, note });
  }

  if (action === "closeReview" || action === "reopenReview") {
    const id = String(body.id ?? "");
    const updated = await prisma.codeReview
      .update({ where: { id }, data: { status: action === "closeReview" ? "closed" : "open" } })
      .catch(() => null);
    if (!updated) return NextResponse.json({ error: "No such review." }, { status: 404 });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const me = await staff();
  if (!me) return DENIED();

  const noteId = req.nextUrl.searchParams.get("noteId");
  if (noteId) {
    await prisma.codeReviewNote.delete({ where: { id: noteId } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Which review?" }, { status: 400 });
  await prisma.codeReview.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
