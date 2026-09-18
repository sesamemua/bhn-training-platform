/**
 * One script — the editor surface (admin-only). Renders ScriptStudio, which
 * shows both editor options (Sections + Rich text) for the user to choose.
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ScriptStudio } from "@/components/workspace/ScriptStudio";
import { HtmlScriptEditor } from "@/components/workspace/HtmlScriptEditor";
import { SharePanel } from "@/components/workspace/SharePanel";
import { ProjectNav } from "@/components/workspace/ProjectNav";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string; scriptId: string }> }

export default async function ScriptEditorPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId, scriptId } = await params;

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: {
      sections: { orderBy: { order: "asc" } },
      project: { select: { id: true, title: true } },
      shareTokens: {
        orderBy: { createdAt: "desc" },
        select: { id: true, token: true, label: true, createdAt: true },
      },
    },
  });
  if (!script || script.projectId !== projectId) notFound();

  const shareLinks = script.shareTokens.map((t) => ({
    id: t.id, token: t.token, label: t.label, createdAt: t.createdAt.toISOString(),
  }));

  const sections = script.sections.map((s) => ({ heading: s.heading, body: s.body }));
  const rc = (script.richContent as { kind?: string; html?: string; css?: string } | null) ?? null;
  const isHtml = script.format === "html";
  const meId = (session.user as { id?: string }).id ?? "anon";
  const meName = (session.user as { name?: string }).name ?? "You";

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><FileText size={11} /> Script · {script.project.title}</>}
        title={script.title}
        actions={
          <div className="flex items-center gap-2">
            {isHtml && <SharePanel scriptId={script.id} initialLinks={shareLinks} />}
            <Link
              href={`/admin/workspace/marketing/video/${projectId}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated"
            >
              <ArrowLeft size={13} /> Back to project
            </Link>
          </div>
        }
      />
      <ProjectNav projectId={projectId} />
      {isHtml ? (
        <HtmlScriptEditor scriptId={script.id} initialHtml={rc?.html ?? ""} css={rc?.css ?? ""} meId={meId} meName={meName} />
      ) : (
        <ScriptStudio
          scriptId={script.id}
          initialFormat={script.format === "richtext" ? "richtext" : "sections"}
          initialSections={sections}
          initialRich={(rc as Record<string, unknown> | null) ?? null}
        />
      )}
    </div>
  );
}
