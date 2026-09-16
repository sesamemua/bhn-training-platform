/**
 * Workspace → Marketing → Merch. The trade-show giveaway shortlist,
 * matched to real products in Business Edge's catalogue and grouped by
 * the tier of visitor they're meant for.
 *
 * The catalogue in src/lib/merch/items.json is the starting point, not
 * the whole board: MerchCard rows add products somebody pasted in and
 * record what has been set aside, and MerchPick rows are the stars. The
 * merge and the grouping live in src/lib/merch/board.ts so this page and
 * the public one cannot disagree about what is on the board.
 */
import { redirect } from "next/navigation";
import { Gift, Share2 } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { MerchBoard } from "@/components/workspace/MerchBoard";
import { MerchNav } from "@/components/merch/MerchNav";
import { MERCH } from "@/lib/merch/types";
import { mergeBoard, type CardRow, type PickRow } from "@/lib/merch/board";

export const dynamic = "force-dynamic";

export default async function WorkspaceMerchPage() {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) redirect("/dashboard");

  const [cards, picks] = await Promise.all([
    prisma.merchCard.findMany({ include: { addedBy: { select: { name: true } } } }).catch(() => []),
    prisma.merchPick.findMany({ include: { user: { select: { name: true } } } }).catch(() => []),
  ]);

  const items = mergeBoard(MERCH.items, cards as CardRow[]);
  const shortlisted = items.filter((i) => i.status === "shortlist").length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Gift size={11} /> Workspace · Marketing</>}
        title="Merch"
        description={`Trade-show giveaway shortlist — ${shortlisted} item${shortlisted === 1 ? "" : "s"} matched to real products in ${MERCH.meta.supplier}'s catalogue, grouped by how much of a conversation the visitor has had. Star what you like, set aside what you don't, add anything the catalogue is missing, and copy a quote request straight to the supplier.`}
      />
      <MerchNav />
      {/* The way an admin finds the shareable link — and, just as
          importantly, the reminder that everything on this page is already
          public. Whoever adds an item should know that before they
          write the next watch-out. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12.5px]">
        <Share2 size={13} className="shrink-0 text-subtle" aria-hidden />
        <span className="text-muted">Need to show this list to someone without an account?</span>
        <Link href="/merch" className="font-semibold text-accent hover:underline">/merch</Link>
        <span className="text-subtle">
          — the same board, open to anyone. Pricing and notes included; stars and anything set aside stay here.
        </span>
      </div>

      <MerchBoard items={items} picks={picks as PickRow[]} viewer={{ userId, canEdit: true }} />
    </div>
  );
}
