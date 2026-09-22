/**
 * The production proposal as a PDF (admin-only).
 *   GET /api/workspace/video-projects/[id]/proposal.pdf
 *
 * Camera, lens, lighting and sound, plus the quotes that were turned
 * down — the sheet you hand to whoever approves the spend. The rest of
 * the budget (mileage, insurance, catering) stays on the page.
 *
 * 404s for a project with no budget rather than serving an empty sheet:
 * the figures come from production-cost.ts, which only has the one.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasBudget } from "@/lib/video/production-cost";
import { buildProductionProposalPdf } from "@/lib/video/proposal-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const project = await prisma.videoProject.findUnique({ where: { id }, select: { title: true } });
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  if (!hasBudget(project.title)) {
    return NextResponse.json({ error: "This project has no budget to propose." }, { status: 404 });
  }

  const user = session.user as { name?: string | null; email?: string | null };
  const pdf = await buildProductionProposalPdf({
    projectTitle: project.title,
    preparedBy: user.name || user.email || null,
  });

  const filename = project.title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "video";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}-equipment-proposal.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
