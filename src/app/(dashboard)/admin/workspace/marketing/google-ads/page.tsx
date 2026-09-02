import { redirect } from "next/navigation";
import { GoogleAdsCampaignDeck } from "@/components/campaign/GoogleAdsCampaignDeck";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GoogleAdsCampaignPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  return <GoogleAdsCampaignDeck />;
}
