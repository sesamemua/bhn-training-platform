/**
 * One call sheet, editable. Everything saves together with the Save button.
 */
import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { CallSheetEditor } from "@/components/workspace/CallSheetEditor";
import { parseCallSheetData } from "@/lib/video/call-sheet";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string; id: string }> }

export default async function CallSheetPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId, id } = await params;
  const row = await prisma.callSheet.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          title: true,
          // The Filming day plan, for "Rebuild from Filming day".
          filming: { select: { location: true, opensAt: true, closesAt: true, notes: true, people: { orderBy: { createdAt: "asc" } }, blocks: { orderBy: { start: "asc" } } } },
        },
      },
    },
  });
  if (!row || row.projectId !== projectId) notFound();

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><ClipboardList size={11} /> {row.project?.title ?? "Video Production"} · Call sheet</>}
        title={row.title}
        description="Edit anything below, then Save. Print gives a clean sheet for the crew."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={projectId} />
      <CallSheetEditor
        id={row.id}
        projectId={projectId}
        initial={{
          title: row.title,
          shootDate: row.shootDate ? row.shootDate.toISOString().slice(0, 10) : "",
          data: parseCallSheetData(row.data),
        }}
        updatedAt={row.updatedAt.toISOString()}
        filming={row.project?.filming ? {
          day: { location: row.project.filming.location, opensAt: row.project.filming.opensAt, closesAt: row.project.filming.closesAt, notes: row.project.filming.notes },
          people: row.project.filming.people.map((p) => ({ id: p.id, name: p.name, group: p.group, role: p.role, email: p.email })),
          blocks: row.project.filming.blocks.map((b) => ({
            id: b.id, kind: b.kind, title: b.title, notes: b.notes, start: b.start.toISOString(), end: b.end.toISOString(),
            prepMinutes: b.prepMinutes, locked: b.locked, flexible: b.flexible, people: b.people, facilitators: b.facilitators, done: b.done,
          })),
        } : null}
      />
    </div>
  );
}
