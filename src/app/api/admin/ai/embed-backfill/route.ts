import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { embed, toVectorLiteral, AI_CONFIGURED } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * Embed every Course / Pathway that doesn't yet have an embedding (or
 * everything if ?force=1). Batches to keep the function under timeout.
 */
export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!AI_CONFIGURED.embed) {
    return NextResponse.json({ error: "Set CF_ACCOUNT_ID and CF_AI_TOKEN to enable embeddings." }, { status: 500 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";

  const courses = await prisma.course.findMany({
    where: force ? {} : { embeddedAt: null },
    select: { id: true, title: true, description: true, category: true },
    take: 60,
  });
  const pathways = await prisma.pathway.findMany({
    where: force ? {} : { embeddedAt: null },
    select: { id: true, title: true, description: true, category: true },
    take: 60,
  });

  let updatedCourses = 0;
  let updatedPathways = 0;
  const errors: string[] = [];

  // Helper: batch into chunks of 20
  async function embedBatch<T extends { id: string; title: string; description: string | null; category: string | null }>(
    rows: T[],
    table: "Course" | "Pathway"
  ) {
    if (rows.length === 0) return 0;
    const texts = rows.map((r) => `${r.category ? r.category + " · " : ""}${r.title}\n\n${r.description ?? ""}`);
    const vectors = await embed(texts, { feature: `embed:${table.toLowerCase()}_backfill`, userId: (session!.user as { id?: string }).id });
    if (!vectors) {
      errors.push(`Embed failed for ${table}`);
      return 0;
    }
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = vectors[i];
      if (!v) continue;
      const lit = toVectorLiteral(v);
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "embedding" = $1::vector, "embeddedAt" = NOW() WHERE "id" = $2`,
        lit,
        rows[i].id
      );
      count++;
    }
    return count;
  }

  // Batches of 20 — multiple within the same fn call is fine
  for (let i = 0; i < courses.length; i += 20) {
    updatedCourses += await embedBatch(courses.slice(i, i + 20), "Course");
  }
  for (let i = 0; i < pathways.length; i += 20) {
    updatedPathways += await embedBatch(pathways.slice(i, i + 20), "Pathway");
  }

  return NextResponse.json({
    ok: true,
    courses: updatedCourses,
    pathways: updatedPathways,
    pendingCourses: Math.max(0, courses.length - updatedCourses),
    pendingPathways: Math.max(0, pathways.length - updatedPathways),
    errors,
  });
}
