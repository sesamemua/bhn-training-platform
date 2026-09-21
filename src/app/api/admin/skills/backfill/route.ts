/**
 * One-shot skill-tagging backfill. Walks every Course, every active
 * InternshipPosting, and every Talent Application submission, runs the
 * extractor, and writes CourseSkill / PostingSkill / UserSkill rows.
 *
 * Idempotent — re-running for the same content updates confidence
 * scores but won't duplicate rows (composite-unique on join tables).
 *
 *   POST /api/admin/skills/backfill   { kind: "courses" | "postings" | "users" | "all", limit?: number }
 *
 * Use the limit param for a quick smoke-test before unleashing the
 * whole catalog.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureSkillSeed, embedMissingSkills, tagCourse, tagPosting, tagUser,
} from "@/lib/skills/ontology";

interface BackfillReport {
  kind: string;
  processed: number;
  tagged: number;
  queued: number;
  durationMs: number;
}

export async function POST(req: NextRequest) {
  await requireRole("admin");
  const body = (await req.json().catch(() => ({}))) as { kind?: string; limit?: number };
  const kind = body.kind ?? "all";
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 200);

  // Make sure the seed is in before tagging — extractor pulls the
  // canonical list from the DB.
  await ensureSkillSeed();
  await embedMissingSkills(limit);

  const reports: BackfillReport[] = [];

  if (kind === "courses" || kind === "all") {
    const start = Date.now();
    const courses = await prisma.course.findMany({
      select: { id: true, title: true, description: true, category: true, tags: true },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
    let tagged = 0; let queued = 0;
    for (const c of courses) {
      const text = [c.title, c.description, c.category, c.tags].filter(Boolean).join("\n\n");
      const r = await tagCourse(c.id, text);
      tagged += r.tagged; queued += r.queued;
    }
    reports.push({ kind: "courses", processed: courses.length, tagged, queued, durationMs: Date.now() - start });
  }

  if (kind === "postings" || kind === "all") {
    const start = Date.now();
    const postings = await prisma.internshipPosting.findMany({
      where: { status: "active" },
      select: { id: true, title: true, positionDetails: true, keySkills: true },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
    let tagged = 0; let queued = 0;
    for (const p of postings) {
      const text = [
        p.title,
        p.positionDetails,
        (p.keySkills ?? []).join(", "),
      ].filter(Boolean).join("\n\n");
      const r = await tagPosting(p.id, text);
      tagged += r.tagged; queued += r.queued;
    }
    reports.push({ kind: "postings", processed: postings.length, tagged, queued, durationMs: Date.now() - start });
  }

  if (kind === "users" || kind === "all") {
    const start = Date.now();
    // Look at the most recent talent-application submissions; that's
    // the highest-signal text we have for trainees today.
    const subs = await prisma.eventFormSubmission.findMany({
      where: { form: { slug: "talent-application" }, userId: { not: null } },
      select: { id: true, userId: true, data: true },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    let tagged = 0; let queued = 0;
    for (const s of subs) {
      if (!s.userId) continue;
      const data = s.data as Record<string, unknown>;
      const text = [
        data.pitch, data.current_position, data.status_goal,
        Array.isArray(data.locations) ? data.locations.join(", ") : null,
      ].filter(Boolean).map(String).join("\n\n");
      if (text.length < 40) continue;
      const r = await tagUser(s.userId, text, "ai", { submissionId: s.id, source: "talent_application" });
      tagged += r.tagged; queued += r.queued;
    }
    reports.push({ kind: "users", processed: subs.length, tagged, queued, durationMs: Date.now() - start });
  }

  return NextResponse.json({ ok: true, reports });
}
