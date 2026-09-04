import { redirect } from "next/navigation";
import { GoogleAdsWorkspace } from "@/components/campaign/GoogleAdsWorkspace";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GoogleAdsCampaignPage() {
  const session = await requireRole("admin").catch(() => null);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  if (!viewerId) redirect("/dashboard");

  return <GoogleAdsWorkspace key={viewerId} viewerId={viewerId} />;
}
