/**
 * A project's tab bar. Scripts goes straight into the script when the
 * project has just one — the list of one was a click for nothing.
 */
import { prisma } from "@/lib/prisma";
import { scriptsHref } from "@/lib/video/paths";
import { ProjectNavTabs } from "./ProjectNavTabs";

export async function ProjectNav({ projectId }: { projectId: string }) {
  const scripts = await prisma.script.findMany({
    where: { projectId, isArchived: false },
    select: { id: true },
    take: 2,
  });
  return <ProjectNavTabs projectId={projectId} scriptsHref={scriptsHref(projectId, scripts.map((s) => s.id))} />;
}
