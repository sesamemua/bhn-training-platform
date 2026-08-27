/**
 * POST /api/public/page-review/[token]/join   { name }
 *
 * Joining a review with the share link and no platform account.
 *
 * The schema has always described shareToken as the thing that "lets
 * colleagues comment without a platform account", but nothing ever
 * minted the pass that would let them: every viewer token came from a
 * route behind requireRole("instructor"), so the overlay's only answer
 * to somebody on a share link was "open this from the training
 * platform to join with your account". This is the missing half.
 *
 * The share token is the authorisation. It is unguessable (128 bits),
 * it can be revoked by clearing the column, and it only ever unlocks
 * one review.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAnonViewerToken } from "@/lib/page-review/viewer";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const review = await prisma.pageReview.findUnique({
    where: { shareToken: token },
    select: { id: true, title: true, status: true },
  });
  // Same answer for a wrong token and a closed review as the sibling
  // route gives, so this cannot be used to probe which links exist.
  if (!review) {
    return NextResponse.json({ error: "This review link is no longer active." }, { status: 404, headers: CORS });
  }
  if (review.status === "closed") {
    return NextResponse.json({ error: "This review is closed." }, { status: 409, headers: CORS });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Give a name so the team knows whose comments these are." },
      { status: 400, headers: CORS },
    );
  }

  const viewer = await createAnonViewerToken(review.id, name);
  return NextResponse.json(
    { ok: true, viewer, review: { title: review.title } },
    { headers: CORS },
  );
}
