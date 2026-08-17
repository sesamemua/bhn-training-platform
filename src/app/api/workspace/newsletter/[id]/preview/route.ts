/**
 * The reviewable rendering of an issue.
 *
 * Same renderer as the Mailchimp export — deliberately, so what gets
 * reviewed is what gets sent — but with `idsBySection` supplied, so every
 * headline, subhead and paragraph carries `data-nl-piece` /
 * `data-nl-part`. Those attributes are what a review note pins to.
 *
 * Returns the fragment as JSON rather than a document: the review client
 * drops it into a same-origin iframe it controls, and injects its own
 * click layer. Serving raw HTML from a route would invite it being opened
 * as a page, which is not what it is.
 *
 * Renders from the CURRENT pieces, not from `renderedHtml`, so a reviewer
 * is never looking at a stale generate.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderIssue } from "@/lib/newsletter/render";
import { EMPTY_LAYOUT, SECTIONS, isSection, type PieceLayout, type Section } from "@/lib/newsletter/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const issue = await prisma.newsletterIssue.findUnique({
    where: { id },
    include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
  });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const bySection = {} as Record<Section, PieceLayout[]>;
  const idsBySection = {} as Record<Section, string[]>;
  for (const s of SECTIONS) {
    bySection[s] = [];
    idsBySection[s] = [];
  }

  let unrendered = 0;
  for (const p of issue.pieces) {
    if (p.status === "excluded" || !isSection(p.section)) continue;
    // A piece with no layout yet has never been through the AI pass. Show
    // it as a placeholder rather than dropping it, so a reviewer can see
    // that a contribution exists and is not yet laid out.
    const layout = (p.layout as PieceLayout | null) ?? {
      ...EMPTY_LAYOUT,
      headline: "Not yet laid out",
      body: [p.rawBody.slice(0, 400)],
    };
    if (!p.layout) unrendered++;
    bySection[p.section].push(layout);
    idsBySection[p.section].push(p.id);
  }

  const html = renderIssue({
    dateline: issue.dateline,
    preheader: issue.preheader,
    bySection,
    idsBySection,
  });

  return NextResponse.json({
    ok: true,
    html,
    issue: { id: issue.id, title: issue.title, dateline: issue.dateline, status: issue.status },
    pieceCount: issue.pieces.length,
    unrendered,
  });
}
