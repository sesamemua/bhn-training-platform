/**
 * Workspace → Merch → BHN Merch Store. The Lucky Flask Pop-Up: a
 * simulated shop for the BioHubNet lab-mascot tees, beside the giveaway
 * board under the same tab bar.
 *
 * Nothing here reads or writes the database. The storefront is a client
 * component with its catalogue in src/lib/merch/store.ts, and the same
 * component is open to anyone at /merch/store. Admin-only here only
 * because the Merch tab is.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Share2, Store } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { MerchNav } from "@/components/merch/MerchNav";
import { MerchStore } from "@/components/merch/MerchStore";
import { STORE_DESIGNS } from "@/lib/merch/store";

export const dynamic = "force-dynamic";

export default async function WorkspaceMerchStorePage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Store size={11} /> Workspace · Marketing</>}
        title="BHN Merch Store"
        description={`A pretend pop-up for the BioHubNet lab-mascot tees — ${STORE_DESIGNS.length} designs in white or black, XS to 3XL. Pick one, check out, get a joke receipt. Nothing is charged, sent or saved; the cart stays in your browser.`}
      />
      <MerchNav />
      {/* Same idea as the board's strip: the link to send, and the reminder that it is open. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[12.5px]">
        <Share2 size={13} className="shrink-0 text-subtle" aria-hidden />
        <span className="text-muted">Want someone without an account to try it?</span>
        <Link href="/merch/store" className="font-semibold text-brand-700 hover:underline">/merch/store</Link>
        <span className="text-subtle">
          — the same store, open to anyone. It asks for nothing and each visitor&apos;s cart stays in their own browser.
        </span>
      </div>

      <MerchStore />
    </div>
  );
}
