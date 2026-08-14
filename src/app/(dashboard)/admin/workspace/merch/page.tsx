/**
 * Workspace → Marketing → Merch. The trade-show giveaway shortlist: 25 items
 * matched to real products in Business Edge's catalogue, grouped by the tier
 * of visitor they're meant for.
 *
 * Static content — the catalogue is a JSON fixture in src/lib/merch, not a
 * database table. Nothing here is per-user, so the page is a thin server
 * shell around a client board that owns the filtering and selection.
 */
import { redirect } from "next/navigation";
import { Gift } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { MerchBoard } from "@/components/workspace/MerchBoard";
import { MERCH } from "@/lib/merch/types";

export const dynamic = "force-dynamic";

export default async function WorkspaceMerchPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Gift size={11} /> Workspace · Marketing</>}
        title="Merch"
        description={`Trade-show giveaway shortlist — ${MERCH.items.length} items matched to real products in ${MERCH.meta.supplier}'s catalogue, grouped by how much of a conversation the visitor has had. Filter, pick a set, and copy a quote request straight to the supplier.`}
      />
      <MerchBoard />
    </div>
  );
}
