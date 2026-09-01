/**
 * /merch — the merch board, open to anyone.
 *
 * The same board as Workspace → Marketing → Merch, with nothing removed:
 * break pricing, setup charges, cost estimates, tier labels, supplier item
 * codes and the internal notes. Published deliberately (asked for and
 * confirmed 2026-09-01) so the list can be sent to a partner, a colleague
 * or the supplier without an account in the way.
 *
 * MerchBoard takes no props, reads no session and calls no API — it is a
 * client component over a static JSON catalogue — so it drops in here
 * unchanged. Whatever lands in src/lib/merch/items.json is public from the
 * moment it is committed. That is the arrangement; anything that should
 * not be published does not belong in that file.
 *
 * Kept out of search deliberately (see `robots` below): a link you send is
 * different from a result someone stumbles onto.
 */
import type { Metadata } from "next";
import { MerchBoard } from "@/components/workspace/MerchBoard";
import { MERCH } from "@/lib/merch/types";

export const metadata: Metadata = {
  title: "Merch shortlist — BioHubNet",
  description:
    "BioHubNet's trade-show giveaway shortlist, matched to real supplier products.",
  robots: { index: false, follow: false },
};

export default function PublicMerchPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header>
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
          BioHubNet
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">Merch</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
          Trade-show giveaway shortlist — {MERCH.items.length} items matched to real products
          in {MERCH.meta.supplier}&apos;s catalogue, grouped by how much of a conversation the
          visitor has had. Filter, pick a set, and copy a quote request straight to the
          supplier.
        </p>
      </header>

      <MerchBoard />
    </main>
  );
}
