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
  const row = await prisma.callSheet.findUnique({ where: { id }, include: { project: { select: { title: true } } } });
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
      />
    </div>
  );
}
