/**
 * One call sheet, editable. Everything saves together with the Save button.
 */
import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { VideoNav } from "@/components/workspace/VideoNav";
import { CallSheetEditor } from "@/components/workspace/CallSheetEditor";
import { parseCallSheetData } from "@/lib/video/call-sheet";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ id: string }> }

export default async function CallSheetPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { id } = await params;
  const row = await prisma.callSheet.findUnique({ where: { id } });
  if (!row) notFound();

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><ClipboardList size={11} /> Workspace · Call sheet</>}
        title={row.title}
        description="Edit anything below, then Save. Print gives a clean one-page sheet for the crew."
      />
      <VideoNav />
      <CallSheetEditor
        id={row.id}
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
