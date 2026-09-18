/**
 * Workspace → Video Production → Call sheets. One per shoot day; open one
 * to edit it, or start a new one blank or from a copy.
 */
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { VideoNav } from "@/components/workspace/VideoNav";
import { CallSheetList } from "@/components/workspace/CallSheetList";
import { parseCallSheetData } from "@/lib/video/call-sheet";

export const dynamic = "force-dynamic";

export default async function CallSheetsPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const rows = await prisma.callSheet.findMany({ orderBy: [{ shootDate: "asc" }, { updatedAt: "desc" }] });
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
        eyebrow={<><ClipboardList size={11} /> Workspace · Marketing</>}
        title="Call sheets"
        description="Who is needed where, and when, for each shoot day — call times, schedule, location, parking, meals and contacts."
      />
      <VideoNav />
      <CallSheetList sheets={sheets} />
    </div>
  );
}
