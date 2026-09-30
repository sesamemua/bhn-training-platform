/**
 * A video project's Prep day tab: the day before the shoot — tasks, who
 * is on each, and the gear to get ready.
 */
import { notFound, redirect } from "next/navigation";
import { ListTodo } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { PrepDay } from "@/components/workspace/PrepDay";
import { mergePrep, prepKey } from "@/lib/video/prep";
import { ON_CAMERA, filmStart, longDate, minuteOfDay } from "@/lib/video/filming";
import { StorageCard } from "@/components/workspace/StorageCard";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function PrepDayPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, filming: { select: { date: true, blocks: { select: { kind: true, title: true, start: true, end: true, prepMinutes: true } }, people: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, group: true } } } } },
  });
  if (!project) notFound();
  const people = project.filming?.people ?? [];
  const saved = await prisma.platformSetting.findUnique({ where: { key: prepKey(project.id) }, select: { value: true } });
  // What the camera records: the filming part of each on-camera block.
  const windows = (project.filming?.blocks ?? []).filter((b) => ON_CAMERA.has(b.kind)).map((b) => {
    const start = b.start.toISOString(), end = b.end.toISOString();
    return { s: minuteOfDay(new Date(filmStart({ start, end, prepMinutes: b.prepMinutes })).toISOString()), e: minuteOfDay(end), title: b.title };
  }).sort((a, b) => a.s - b.s);
  // The day before the shoot, when there is a shoot day.
  const prepDate = project.filming ? new Date(project.filming.date.getTime() - 86_400_000).toISOString().slice(0, 10) : null;

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={<><ListTodo size={11} /> Video Production · Prep day</>}
        title={project.title}
        description="The day before the shoot: what has to be done, who is doing it, and the gear and the drives to get ready. Tick things off as they are done; it saves as you go."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <PrepDay
        projectId={project.id}
        when={prepDate ? `${longDate(prepDate)} — the day before filming` : "The day before filming"}
        people={people}
        initial={mergePrep(saved?.value, people)}
      />
      <StorageCard windows={windows} />
    </div>
  );
}
