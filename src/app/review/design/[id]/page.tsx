import { redirect } from "next/navigation";
import { deniedRedirect, requireRole } from "@/lib/auth";
import DesignReviewPage from "@/app/(dashboard)/admin/workspace/design-review/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design Review | BioHubNet", robots: { index: false, follow: false } };

export default async function FullDesignReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await requireRole("instructor").catch(() => null)) redirect(await deniedRedirect(`/review/design/${encodeURIComponent(id)}`));
  return <main className="mx-auto max-w-screen-2xl p-4 sm:p-6">
    <DesignReviewPage searchParams={Promise.resolve({ a: id, focus: "1" })} />
  </main>;
}
