/**
 * Website review — the review collection.
 *
 *   GET  /api/workspace/page-review   → reviews, most recently touched first
 *   POST /api/workspace/page-review   → open a review on a URL (admin)
 *
 * Opening a review mints a share token so colleagues can comment from the
 * page itself without a platform account.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeReviewUrl, pageNameFromReviewUrl } from "@/lib/page-review/access";

export const dynamic = "force-dynamic";

/** A Mailchimp export is large; this is not a file store. */
const MAX_PASTE_CHARS = 1_000_000;

/**
 * Either a live page or a paste. A review of a paste has no address of
 * its own, so it gets one pointing at the route that serves it — which
 * means everything downstream that reads `url` keeps working unchanged.
 */
const CreateSchema = z.union([
  z.object({ url: z.string().trim().min(1, "Enter a website address.").max(500) }),
  z.object({
    html: z.string().min(1, "Paste something first.").max(MAX_PASTE_CHARS),
    title: z.string().trim().max(160).optional(),
  }),
]);



export async function GET() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const reviews = await prisma.pageReview.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true, url: true, title: true, status: true, round: true,
      createdAt: true, updatedAt: true,
      _count: { select: { comments: true } },
    },
  });
  return NextResponse.json({ ok: true, reviews });
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the URL and title." },
      { status: 400 },
    );
  }

  /*
   * A pasted review. It is created first and its url is filled in
   * afterwards, because the address it points at contains the share
   * token, which does not exist until the row does.
   */
  if ("html" in parsed.data) {
    const token = randomBytes(16).toString("base64url");
    const review = await prisma.pageReview.create({
      data: {
        kind: "paste",
        pastedHtml: parsed.data.html,
        title: parsed.data.title?.trim() || "Pasted markup",
        url: `/review-paste/${token}`,
        shareToken: token,
        createdById: (session.user as { id?: string }).id ?? null,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: review.id, kind: "paste" });
  }

  let url: string;
  try {
    url = normalizeReviewUrl(parsed.data.url);
  } catch {
    return NextResponse.json(
      { error: "Enter a valid website address." },
      { status: 400 },
    );
  }
  const activeReviews = await prisma.pageReview.findMany({
    // Only live-page reviews dedupe by address; two pastes with the
    // same stand-in url cannot happen, and two of the same markup are
    // a deliberate second round.
    where: { status: { not: "closed" }, kind: "url" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, url: true },
  });
  const existing = activeReviews.find((review) => normalizeReviewUrl(review.url) === url);
  if (existing) {
    await prisma.pageReview.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true, id: existing.id, reused: true });
  }

  const review = await prisma.pageReview.create({
    data: {
      url,
      title: pageNameFromReviewUrl(url),
      // 128-bit URL-safe token — same shape as the EQUIP report share links.
      shareToken: randomBytes(16).toString("base64url"),
      createdById: (session.user as { id?: string }).id ?? null,
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: review.id });
}
