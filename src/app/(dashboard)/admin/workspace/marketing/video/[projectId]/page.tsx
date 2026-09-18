/**
 * One video project — its Scripts tab (admin-only). Call sheets and
 * Production cost are the project's other two tabs (ProjectNav).
 */
import { redirect, notFound } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { VideoProjectDetailClient } from "@/components/workspace/VideoProjectDetailClient";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function VideoProjectDetailPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;

  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    include: {
      scripts: {
        where: { isArchived: false },
        orderBy: { order: "asc" },
        select: { id: true, title: true, format: true, updatedAt: true, _count: { select: { sections: true } } },
      },
    },
  });
  if (!project) notFound();

  const scripts = project.scripts.map((s) => ({
    id: s.id,
    title: s.title,
    format: s.format,
    sectionCount: s._count.sections,
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Clapperboard size={11} /> Video Production · Scripts</>}
        title={project.title}
        description={project.summary || "Scripts for this video."}
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <VideoProjectDetailClient projectId={project.id} initialScripts={scripts} />
    </div>
  );
}
