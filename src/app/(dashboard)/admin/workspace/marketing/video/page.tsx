/**
 * Workspace → Marketing → Video Production. Admin-only list of video projects.
 */
import { redirect } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { VideoProjectsClient } from "@/components/workspace/VideoProjectsClient";
import { VideoNav } from "@/components/workspace/VideoNav";
import { ensureBhnPromoProject, ensureSymposiumCommsProject } from "@/lib/scripts/seed";

export const dynamic = "force-dynamic";

export default async function VideoProductionPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  // Team-owned starter projects are always present (no manual seed step):
  // the BHN Promo Video project (Molly guide) and the 2026 Symposium
  // communications plan (editable Gantt + full plan).
  const meId = (session.user as { id?: string }).id ?? null;
  await ensureBhnPromoProject(meId);
  await ensureSymposiumCommsProject(meId);

  const projects = await prisma.videoProject.findMany({
    where: { category: "marketing", isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { scripts: true } } },
  });
  const data = projects.map((p) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    status: p.status,
    scriptCount: p._count.scripts,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Clapperboard size={11} /> Workspace · Marketing</>}
        title="Video Production"
        description="Plan promo videos and draft their scripts. Scripts can be shared for collaborative editing — contributors don't need an account."
      />
      <VideoNav />
      <VideoProjectsClient initialProjects={data} />
    </div>
  );
}
