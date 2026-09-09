/**
 * /merch — the merch board, open to anyone.
 *
 * The same board as Workspace → Marketing → Merch: break pricing, setup
 * charges, cost estimates, tier labels, supplier item codes and the
 * internal notes. Published deliberately (asked for and confirmed
 * 2026-09-01) so the list can be sent to a partner, a colleague or the
 * supplier without an account in the way.
 *
 * Two things do NOT cross over, because they are the team working rather
 * than the team's answer: the stars (who likes what) and anything set
 * aside. A rejected item is not shown here at all — publishing a list
 * that includes what was already turned down misleads whoever reads it.
 *
 * MerchBoard renders read-only without a `viewer`, so nothing here can
 * star, move or add. Whatever is on the shortlist is public from the
 * moment it is saved. That is the arrangement; anything that should not
 * be published does not belong on the board.
 *
 * Kept out of search deliberately (see `robots` below): a link you send
 * is different from a result someone stumbles onto.
 */
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { MerchBoard } from "@/components/workspace/MerchBoard";
import { MERCH } from "@/lib/merch/types";
import { mergeBoard, type CardRow } from "@/lib/merch/board";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merch shortlist — BioHubNet",
  description: "BioHubNet's trade-show giveaway shortlist, matched to real supplier products.",
  robots: { index: false, follow: false },
};

export default async function PublicMerchPage() {
  const cards = await prisma.merchCard
    .findMany({ include: { addedBy: { select: { name: true } } } })
    .catch(() => []);
  const shortlist = mergeBoard(MERCH.items, cards as CardRow[]).filter((i) => i.status === "shortlist");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-subtle">BioHubNet</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">Merch</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
          Trade-show giveaway shortlist — {shortlist.length} item{shortlist.length === 1 ? "" : "s"} matched to
          real products in {MERCH.meta.supplier}&apos;s catalogue, grouped by how much of a conversation the
          visitor has had. Filter, pick a set, and copy a quote request straight to the supplier.
        </p>
      </header>

      <MerchBoard items={shortlist} />
    </main>
  );
}
