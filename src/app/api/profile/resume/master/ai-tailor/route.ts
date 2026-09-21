/**
 * POST /api/profile/resume/master/ai-tailor
 *
 * Preview-only AI tailor flow.
 *
 *   body: {
 *     resumeId:        string;   // the target resume the user is tailoring
 *     postingId?:      string;   // either this OR jobDescription is required
 *     jobDescription?: string;
 *     maxBullets?:     number;   // default 12
 *   }
 *
 * Steps:
 *   1. Resolve JD text (posting row or free-text).
 *   2. Embed JD + cosine-rank the caller's non-archived MasterBullets,
 *      take top 30.
 *   3. Hand JD + shortlist to the LLM, parse a JSON pick + light
 *      rewrites + per-bullet reasons.
 *   4. Return a preview the user can accept / reject per-bullet via
 *      the companion /apply endpoint. Nothing is written here.
 *
 * Self-scoped — the resumeId must belong to the caller's account.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveResume } from "@/lib/resume/active";
import { getOrCreateMaster } from "@/lib/resume/master";
import {
  resolveJdText, shortlistByCosine, pickAndRewrite,
  COSINE_SHORTLIST, HARD_BULLET_CAP,
} from "@/lib/resume/master-tailor";

export const runtime = "nodejs";

/** GET — list candidate postings the drawer can offer in its picker.
 *  Pulls the caller's saved postings first (most-relevant) plus a
 *  recency-ordered slice of active postings, deduped. */
export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [saved, active] = await Promise.all([
    prisma.userSavedPosting.findMany({
      where: { userId, posting: { status: "active" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        posting: {
          select: { id: true, title: true, companyName: true, location: true, deadline: true },
        },
      },
    }),
    prisma.internshipPosting.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, companyName: true, location: true, deadline: true },
    }),
  ]);

  const map = new Map<string, {
    id: string; title: string; companyName: string;
    location: string | null; deadline: string | null; saved: boolean;
  }>();
  for (const row of saved) {
    map.set(row.posting.id, {
      ...row.posting,
      deadline: row.posting.deadline?.toISOString() ?? null,
      saved: true,
    });
  }
  for (const p of active) {
    if (map.has(p.id)) continue;
    map.set(p.id, {
      id: p.id,
      title: p.title,
      companyName: p.companyName,
      location: p.location,
      deadline: p.deadline?.toISOString() ?? null,
      saved: false,
    });
  }
  return NextResponse.json({
    ok: true,
    postings: Array.from(map.values()),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    resumeId?: unknown;
    postingId?: unknown;
    jobDescription?: unknown;
    maxBullets?: unknown;
  };
  const resumeId = typeof body.resumeId === "string" ? body.resumeId : null;
  const postingId = typeof body.postingId === "string" && body.postingId.trim() ? body.postingId.trim() : null;
  const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription : null;
  const rawMax = typeof body.maxBullets === "number" ? body.maxBullets : 12;
  const maxBullets = Math.max(1, Math.min(Math.floor(rawMax), HARD_BULLET_CAP));

  if (!resumeId) {
    return NextResponse.json({ error: "resumeId required" }, { status: 400 });
  }
  if (!postingId && (!jobDescription || jobDescription.trim().length < 40)) {
    return NextResponse.json(
      { error: "Provide either a postingId or at least a paragraph of job description text." },
      { status: 400 },
    );
  }

  // Verify the target resume belongs to the caller — even though
  // the preview doesn't write anything, we'd rather not let one user
  // burn AI credits aimed at another user's resume id.
  const target = await getActiveResume({ userId, resumeId });
  if (!target) {
    return NextResponse.json({ error: "Target resume not found." }, { status: 404 });
  }

  // Resolve the JD.
  const jd = await resolveJdText({ postingId, jobDescription });
  if ("error" in jd) {
    return NextResponse.json({ error: jd.error }, { status: 400 });
  }

  // Locate the caller's master + count non-archived bullets — bail
  // early with a friendly message if the library is empty so the user
  // doesn't burn an embed + LLM call against nothing.
  const master = await getOrCreateMaster(prisma, userId);
  const liveCount = await prisma.masterBullet.count({
    where: { masterId: master.id, isArchived: false },
  });
  if (liveCount === 0) {
    return NextResponse.json(
      {
        error: "Your master library is empty — add bullets on /profile/master first, then come back.",
        emptyLibrary: true,
      },
      { status: 400 },
    );
  }

  // Cosine shortlist.
  const shortlist = await shortlistByCosine({
    masterId: master.id,
    jdText: jd.text,
    userId,
    limit: COSINE_SHORTLIST,
  });

  // LLM pick + light rewrite.
  const picked = await pickAndRewrite({
    jd,
    shortlist: shortlist.rows,
    maxBullets,
    userId,
  });
  if (!picked.ok) {
    return NextResponse.json({ error: picked.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    jdLabel: jd.label,
    suggestions: picked.suggestions,
    shortlistSize: shortlist.rows.length,
    libraryLiveCount: liveCount,
    shortlistMode: shortlist.mode,
  });
}
