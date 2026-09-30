/**
 * A video project's Before the shoot tab: what has to be done in the days
 * ahead — who is on each thing, and by when.
 */
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { PrepDay } from "@/components/workspace/PrepDay";
import { DEFAULT_PRESHOOT, mergePrep, preshootKey } from "@/lib/video/prep";
import { longDate } from "@/lib/video/filming";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function BeforeTheShootPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, filming: { select: { date: true, people: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, group: true } } } } },
  });
  if (!project) notFound();
  const people = project.filming?.people ?? [];
  const saved = await prisma.platformSetting.findUnique({ where: { key: preshootKey(project.id) }, select: { value: true } });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><ClipboardCheck size={11} /> Video Production · Before the shoot</>}
        title={project.title}
        description="Everything that has to be done before the shoot — who is on it, and by when. Tick things off as they are done; it saves as you go."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <PrepDay
        list="preshoot"
        heading="Before the shoot"
        projectId={project.id}
        when={project.filming ? `Shoot day: ${longDate(project.filming.date.toISOString().slice(0, 10))}` : "No shoot day planned yet"}
        people={people}
        initial={mergePrep(saved?.value, people, DEFAULT_PRESHOOT)}
      />
    </div>
  );
}
