/**
 * Live-match-while-posting endpoint.
 *
 *   POST /api/match/preview { text }
 *
 * Used by the employer's job-posting form: as the employer types
 * positionDetails, debounce a call here. We extract skills from the
 * draft text in-memory (don't persist anything) and return the top
 * matching anonymised trainees. Drives the "post to convert" loop.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole, getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractSkillsFromText, scoreMatch } from "@/lib/skills/ontology";

export async function POST(req: NextRequest) {
  // Open to employers, admins, and superadmins.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (!role || !["employer", "admin", "superadmin"].includes(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (text.length < 60) {
    return NextResponse.json({ candidates: [], extractedSkills: [], hint: "Type more about the role to see matches." });
  }

  const extraction = await extractSkillsFromText(text);
  if (extraction.existing.length === 0) {
    return NextResponse.json({
      candidates: [],
      extractedSkills: [],
      hint: "We couldn't pick up specific skills from this text yet. Try mentioning techniques, tools, or competencies.",
    });
  }

  const skillIds = extraction.existing.map((e) => e.skillId);
  const synthPostingSkills = extraction.existing.map((e) => ({
    skillId: e.skillId,
    weight: 0.6,
    required: e.confidence >= 0.9,
  }));

  // Pull candidates with at least one of these skills (cheap pre-filter).
  const candidates = await prisma.user.findMany({
    where: {
      role: { in: ["trainee", "evaluating"] },
      isActive: true,
      skills: { some: { skillId: { in: skillIds } } },
    },
    select: {
      id: true, name: true,
      skills: {
        select: {
          skillId: true, level: true, source: true,
          skill: { select: { name: true, category: true, status: true } },
        },
      },
      _count: { select: { enrollments: { where: { status: "completed" } } } },
    },
    take: 200,
  });

  const scored = candidates
    .map((c) => {
      const userSkills = c.skills
        .filter((s) => s.skill.status !== "merged")
        .map((s) => ({ skillId: s.skillId, level: s.level }));
      const m = scoreMatch(userSkills, synthPostingSkills);
      return {
        initials: (c.name ?? "??").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join(""),
        score: m.score,
        matched: m.matched,
        completedCourses: c._count.enrollments,
        topSkills: c.skills
          .filter((s) => s.skill.status !== "merged" && skillIds.includes(s.skillId))
          .slice(0, 5)
          .map((s) => s.skill.name),
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return NextResponse.json({
    candidates: scored,
    extractedSkills: extraction.existing.map((e) => ({ name: e.name, confidence: e.confidence })),
    novelSkills: extraction.novel.map((n) => n.name),
  });
}
