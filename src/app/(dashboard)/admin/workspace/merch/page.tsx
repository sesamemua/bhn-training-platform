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
import { Gift, Share2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { MerchBoard } from "@/components/workspace/MerchBoard";
import { MERCH } from "@/lib/merch/types";
import Link from "next/link";

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
      {/* The way an admin finds the shareable link. Without this the public
          page exists but nobody knows the URL, which is the same as it not
          existing. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12.5px]">
        <Share2 size={13} className="shrink-0 text-subtle" aria-hidden />
        <span className="text-muted">
          Need to show this list to someone without an account?
        </span>
        <Link href="/merch" className="font-semibold text-accent hover:underline">
          /merch
        </Link>
        <span className="text-subtle">
          — names, photos and supplier links only. No pricing, no tiers.
        </span>
      </div>

      <MerchBoard />
    </div>
  );
}
