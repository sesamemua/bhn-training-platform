import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { deniedRedirect, requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { ReportEditor } from "@/components/workspace/symposium-report/ReportEditor";
import { REPORT_PATH } from "@/lib/symposium-report/document";
import { loadReport } from "@/lib/symposium-report/store";

export const dynamic = "force-dynamic";

export default async function SymposiumReportPage() {
  const session = await requireRole("instructor").catch(() => null);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(await deniedRedirect(REPORT_PATH));

  const data = await loadReport();
  return (
    <div className="symposium-report-screen space-y-6">
      <div className="report-screen-only">
        <PageHero eyebrow={<><FileText size={12} /> 2026 Symposium</>} title="Event Report"
          description="Review the US Letter report, edit directly on the page, and approve a saved round for PDF export." />
      </div>
      {data ? <ReportEditor key={`${data.review.round}:${data.review.status}`} {...data}
        meId={user.id} isAdmin={user.role === "admin" || user.role === "superadmin"} />
        : <p className="rounded-xl border border-line bg-card p-5 text-sm text-muted">The report is being prepared for its first review round.</p>}
    </div>
  );
}
