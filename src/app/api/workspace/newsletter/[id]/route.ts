/**
 * Newsletter workshop — one issue.
 *
 *   POST /api/workspace/newsletter/[id]   { action, ... }
 *
 *     addPiece    (instructor+) — drop a contribution into a section
 *     deletePiece (admin)       — remove one
 *     movePiece   (admin)       — reorder within a section
 *     generate    (admin)       — normalise every piece via AI, then
 *                                 render the Mailchimp fragment
 *
 * Normalisation is cached on the piece: `generate` only calls the model
 * for pieces whose rawBody changed since they were last normalised, so
 * re-rendering after adding one item costs one call, not twenty.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalisePiece } from "@/lib/newsletter/ai";
import { renderIssue } from "@/lib/newsletter/render";
import { SECTIONS, isSection } from "@/lib/newsletter/types";
import type { Section, PieceLayout } from "@/lib/newsletter/types";
import { buildAiBrief, parseAiReturn } from "@/lib/newsletter/handoff";

export const dynamic = "force-dynamic";

const AddSchema = z.object({
  action: z.literal("addPiece"),
  section: z.string().refine(isSection, "Unknown section"),
  rawBody: z.string().trim().min(10, "Give us a sentence or two at least.").max(6000),
  sourceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});
const IdSchema = z.object({
  action: z.union([z.literal("deletePiece"), z.literal("movePiece")]),
  pieceId: z.string().min(1),
  direction: z.union([z.literal("up"), z.literal("down")]).optional(),
});
/** Editing a contribution after it lands. Same limits as adding one:
 *  a piece that could not be submitted should not be reachable by edit. */
const UpdateSchema = z.object({
  action: z.literal("updatePiece"),
  pieceId: z.string().min(1),
  rawBody: z.string().trim().min(10, "Give us a sentence or two at least.").max(6000),
  sourceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});
const GenerateSchema = z.object({ action: z.literal("generate") });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  // ── contribute ───────────────────────────────────────────────
  if (action === "addPiece") {
    const session = await requireRole("instructor").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = AddSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the submission." },
        { status: 400 },
      );
    }
    const issue = await prisma.newsletterIssue.findUnique({ where: { id }, select: { id: true } });
    if (!issue) return NextResponse.json({ error: "No such issue." }, { status: 404 });

    const last = await prisma.newsletterPiece.findFirst({
      where: { issueId: id, section: parsed.data.section },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await prisma.newsletterPiece.create({
      data: {
        issueId: id,
        section: parsed.data.section,
        position: (last?.position ?? -1) + 1,
        rawBody: parsed.data.rawBody,
        sourceUrl: parsed.data.sourceUrl || null,
        authorId: (session.user as { id?: string }).id ?? null,
        authorName: (session.user as { name?: string }).name ?? null,
      },
    });
    return NextResponse.json({ ok: true, ...(await loadIssue(id)) });
  }

  // ── remove / reorder ─────────────────────────────────────────
  // ── edit a contribution already in the issue ─────────────────
  if (action === "updatePiece") {
    const session = await requireRole("instructor").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the submission." },
        { status: 400 },
      );
    }
    const piece = await prisma.newsletterPiece.findFirst({
      where: { id: parsed.data.pieceId, issueId: id },
      select: { id: true },
    });
    if (!piece) return NextResponse.json({ error: "No such piece." }, { status: 404 });
    await prisma.newsletterPiece.update({
      where: { id: piece.id },
      data: {
        rawBody: parsed.data.rawBody,
        sourceUrl: parsed.data.sourceUrl?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true, ...(await loadIssue(id)) });
  }

  if (action === "deletePiece" || action === "movePiece") {
    const session = await requireRole("admin").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = IdSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    const piece = await prisma.newsletterPiece.findFirst({
      where: { id: parsed.data.pieceId, issueId: id },
      select: { id: true, section: true, position: true },
    });
    if (!piece) return NextResponse.json({ error: "No such piece." }, { status: 404 });

    if (parsed.data.action === "deletePiece") {
      await prisma.newsletterPiece.delete({ where: { id: piece.id } });
    } else {
      // Swap positions with the neighbour in the same section.
      const dir = parsed.data.direction === "up" ? "lt" : "gt";
      const neighbour = await prisma.newsletterPiece.findFirst({
        where: { issueId: id, section: piece.section, position: { [dir]: piece.position } },
        orderBy: { position: dir === "lt" ? "desc" : "asc" },
        select: { id: true, position: true },
      });
      if (neighbour) {
        await prisma.$transaction([
          prisma.newsletterPiece.update({ where: { id: piece.id }, data: { position: neighbour.position } }),
          prisma.newsletterPiece.update({ where: { id: neighbour.id }, data: { position: piece.position } }),
        ]);
      }
    }
    return NextResponse.json({ ok: true, ...(await loadIssue(id)) });
  }

  // ── normalise + render ───────────────────────────────────────
  /*
   * The hand-off out. Same raw submissions the in-app generator reads,
   * wrapped in a prompt an editor can paste into their own chat window.
   * Read-only — instructor, like the rest of the reading side.
   */
  if (action === "aiBrief") {
    const session = await requireRole("instructor").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const issue = await prisma.newsletterIssue.findUnique({
      where: { id },
      include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
    });
    if (!issue) return NextResponse.json({ error: "No such issue." }, { status: 404 });

    const pieces = issue.pieces
      .filter((p) => p.status !== "excluded" && isSection(p.section))
      .map((p) => ({
        id: p.id,
        section: p.section as Section,
        rawBody: p.rawBody,
        sourceUrl: p.sourceUrl,
        authorName: p.authorName,
      }));
    if (pieces.length === 0) {
      return NextResponse.json({ error: "Nothing to send out yet — add a piece first." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, brief: buildAiBrief(pieces, issue.dateline), count: pieces.length });
  }

  /*
   * The hand-off back. Applies whatever validated, names whatever did
   * not, and NEVER drops a piece silently — a submission that the reply
   * forgot about keeps the layout it already had.
   */
  if (action === "aiApply") {
    const session = await requireRole("admin").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const text = typeof body?.text === "string" ? body.text : "";
    if (text.length > 500_000) {
      return NextResponse.json({ error: "That paste is far too long." }, { status: 413 });
    }

    const issue = await prisma.newsletterIssue.findUnique({
      where: { id },
      include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
    });
    if (!issue) return NextResponse.json({ error: "No such issue." }, { status: 404 });

    const pieces = issue.pieces
      .filter((p) => p.status !== "excluded" && isSection(p.section))
      .map((p) => ({ id: p.id, section: p.section as Section, rawBody: p.rawBody }));

    const report = parseAiReturn(text, pieces);
    if (!report.ok) {
      return NextResponse.json({ error: report.problems[0] ?? "Nothing usable in that paste.", report }, { status: 400 });
    }

    const rawById = new Map(issue.pieces.map((p) => [p.id, p.rawBody]));
    await prisma.$transaction(
      report.applied.map((a) =>
        prisma.newsletterPiece.update({
          where: { id: a.id },
          // _src is stamped the way the in-app generator stamps it, so
          // "unchanged since last run" stays true of a hand-laid piece
          // and Generate does not quietly overwrite this work.
          data: {
            layout: { ...a.layout, _src: rawById.get(a.id) ?? "" } as object,
            status: "normalised",
          },
        }),
      ),
    );

    const fresh = await loadIssue(id);
    return NextResponse.json({ ok: true, issue: fresh, report });
  }

  if (action === "generate") {
    const session = await requireRole("admin").catch(() => null);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!GenerateSchema.safeParse(body).success) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    const meId = (session.user as { id?: string }).id ?? null;

    const issue = await prisma.newsletterIssue.findUnique({
      where: { id },
      include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
    });
    if (!issue) return NextResponse.json({ error: "No such issue." }, { status: 404 });
    if (issue.pieces.length === 0) {
      return NextResponse.json({ error: "Nothing to lay out yet — add a piece first." }, { status: 400 });
    }

    const headlines: string[] = [];
    const bySection = emptyBuckets();

    for (const p of issue.pieces) {
      if (p.status === "excluded" || !isSection(p.section)) continue;
      const cached = p.layout as (PieceLayout & { _src?: string }) | null;
      let layout: PieceLayout;

      if (cached?._src === p.rawBody && cached.headline) {
        layout = cached; // unchanged since last run — skip the model
      } else {
        layout = await normalisePiece(
          { section: p.section, rawBody: p.rawBody, sourceUrl: p.sourceUrl, siblingHeadlines: headlines },
          meId,
        );
        await prisma.newsletterPiece.update({
          where: { id: p.id },
          data: {
            // `_src` stamps the rawBody this layout came from, so a later
            // re-render can skip pieces nobody edited.
            layout: toJson({ ...layout, _src: p.rawBody }),
            status: "normalised",
          },
        });
      }
      headlines.push(layout.headline);
      bySection[p.section].push(layout);
    }

    const html = renderIssue({
      dateline: issue.dateline,
      preheader: issue.preheader,
      bySection,
    });
    await prisma.newsletterIssue.update({
      where: { id },
      data: { renderedHtml: html, renderedAt: new Date(), status: "generated" },
    });
    return NextResponse.json({ ok: true, html, ...(await loadIssue(id)) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/**
 * Prisma rejects a bare interface for a Json column because optional props
 * are `undefined`, which has no JSON representation. Round-tripping drops
 * them, which is what we want stored anyway — and it means no type
 * assertion is needed here.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value));
}

function emptyBuckets(): Record<Section, PieceLayout[]> {
  const out = {} as Record<Section, PieceLayout[]>;
  for (const s of SECTIONS) out[s] = [];
  return out;
}

async function loadIssue(id: string) {
  const issue = await prisma.newsletterIssue.findUnique({
    where: { id },
    include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
  });
  return { issue };
}
