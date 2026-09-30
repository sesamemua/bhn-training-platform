/**
 * A video project's Logistics tab: what to bring on the shoot day, ticked
 * off as it is packed.
 */
import { notFound, redirect } from "next/navigation";
import { Backpack } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { KitList } from "@/components/workspace/KitList";
import { kitKey, mergeKit } from "@/lib/video/kit";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function LogisticsPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true, title: true } });
  if (!project) notFound();
  const saved = await prisma.platformSetting.findUnique({ where: { key: kitKey(project.id) }, select: { value: true } });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Backpack size={11} /> Video Production · Logistics</>}
        title={project.title}
        description="What to bring on the shoot day — tick things off as they are packed. Add anything missing; it saves as you go."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <KitList projectId={project.id} initial={mergeKit(saved?.value)} />
    </div>
  );
}
