/** Design review moved to its own place in the sidebar; old links land there. */
import { redirect } from "next/navigation";

export default async function OldDesignReviewPage({ searchParams }: { searchParams: Promise<{ p?: string; a?: string }> }) {
  const { p, a } = await searchParams;
  const q = a ? `?a=${encodeURIComponent(a)}` : p ? `?p=${encodeURIComponent(p)}` : "";
  redirect(`/admin/workspace/design-review${q}`);
}
