/**
 * A video project's Filming day tab: the shoot day as a timeline — tasks
 * as bars, people dragged onto them.
 */
import { notFound, redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { FilmingBoard } from "@/components/workspace/FilmingBoard";
import { CreateFilmingDay } from "@/components/workspace/CreateFilmingDay";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function FilmingDayPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true,
      filming: {
        include: {
          people: { orderBy: { createdAt: "asc" } },
          blocks: { orderBy: { start: "asc" } },
        },
      },
    },
  });
  if (!project) notFound();
  const f = project.filming;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><CalendarClock size={11} /> Video Production · Filming day</>}
        title={project.title}
        description="The shoot day hour by hour: every task as a bar, and who is on it. Drag people onto tasks; clashes and building hours are checked as you go."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      {f ? (
        <FilmingBoard
          day={{ id: f.id, title: f.title, date: f.date.toISOString().slice(0, 10), location: f.location, opensAt: f.opensAt, closesAt: f.closesAt, notes: f.notes }}
          people={f.people.map((p) => ({ id: p.id, name: p.name, group: p.group, role: p.role, email: p.email }))}
          blocks={f.blocks.map((b) => ({
            id: b.id, kind: b.kind, title: b.title, notes: b.notes, start: b.start.toISOString(), end: b.end.toISOString(),
            prepMinutes: b.prepMinutes, locked: b.locked, flexible: b.flexible, people: b.people,
          }))}
        />
      ) : (
        <CreateFilmingDay projectId={project.id} />
      )}
    </div>
  );
}
