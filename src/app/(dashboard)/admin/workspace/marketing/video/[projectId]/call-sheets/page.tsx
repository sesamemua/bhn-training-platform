/**
 * A video project's Call sheets tab: one sheet per shoot day.
 */
import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { CallSheetList } from "@/components/workspace/CallSheetList";
import { parseCallSheetData } from "@/lib/video/call-sheet";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function CallSheetsPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({ where: { id: projectId }, select: { id: true, title: true } });
  if (!project) notFound();

  const rows = await prisma.callSheet.findMany({
    where: { projectId },
    orderBy: [{ shootDate: "asc" }, { updatedAt: "desc" }],
  });
  const sheets = rows.map((r) => {
    const d = parseCallSheetData(r.data);
    return {
      id: r.id,
      title: r.title,
      shootDate: r.shootDate ? r.shootDate.toISOString().slice(0, 10) : "",
      location: d.locationName,
      generalCall: d.generalCall,
      people: d.people.length,
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><ClipboardList size={11} /> Video Production · Call sheets</>}
        title={project.title}
        description="Who is needed where, and when, for each shoot day — call times, schedule, location, parking, meals and contacts."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <CallSheetList projectId={project.id} sheets={sheets} />
    </div>
  );
}
