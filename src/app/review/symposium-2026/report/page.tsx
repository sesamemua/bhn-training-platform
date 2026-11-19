import { redirect } from "next/navigation";
import { deniedRedirect, requireRole } from "@/lib/auth";
import { ReportEditor } from "@/components/workspace/symposium-report/ReportEditor";
import { REPORT_PATH, REPORT_REVIEW_PATH } from "@/lib/symposium-report/document";
import { loadReport } from "@/lib/symposium-report/store";
import { readReportGallery } from "@/lib/symposium-report/gallery-store";

export const metadata = { title: "Event Report Review | BioHubNet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EventReportReviewPage() {
  const session = await requireRole("instructor").catch(() => null);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(await deniedRedirect(REPORT_REVIEW_PATH));

  const [data, gallery] = await Promise.all([loadReport(), readReportGallery()]);
  return <main className="symposium-report-screen mx-auto max-w-screen-2xl px-3 py-5 sm:px-6">
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">Event Report Review</h1>
        {data && <p className="text-sm text-muted">Round {data.review.round} · {data.review.status === "closed" ? "Approved" : "In review"}</p>}
      </div>
      <a href={REPORT_PATH} className="rounded-md border border-line px-3 py-2 text-sm font-semibold">Open report editor</a>
    </header>
    {data ? <ReportEditor key={`${data.review.round}:${data.review.status}`} {...data} fullPageReview
      meId={user.id} isAdmin={user.role === "admin" || user.role === "superadmin"}
      recommendations={Object.fromEntries(Object.entries(gallery.defaults).map(([section, photos]) =>
        [section, photos.map(({ label, ...photo }) => ({ ...photo, caption: label }))],
      ))} /> : <p>The report is being prepared for its first review round.</p>}
  </main>;
}
