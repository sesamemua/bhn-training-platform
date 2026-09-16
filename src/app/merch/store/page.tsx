/**
 * /merch/store — the BHN Merch Store, open to anyone.
 *
 * The same Lucky Flask Pop-Up as Workspace → Merch → BHN Merch Store, so a
 * tee design can be shown to someone without an account. Safe to publish
 * because it is a simulation end to end: no database, no network calls, no
 * name, email, address or payment fields — each visitor's cart lives in
 * their own browser and nowhere else.
 *
 * Kept out of search like /merch: it is a link you send, not a shop
 * somebody should mistake for a real one.
 */
import type { Metadata } from "next";
import { MerchStore } from "@/components/merch/MerchStore";

export const metadata: Metadata = {
  title: "BHN Merch Store — BioHubNet",
  description: "A simulated pop-up store for the BioHubNet lab-mascot tees. Nothing is charged, shipped or saved.",
  robots: { index: false, follow: false },
};

export default function PublicMerchStorePage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-subtle">BioHubNet</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">BHN Merch Store</h1>
        <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
          A pretend pop-up for our lab-mascot tees. Choose a critter, a colour and a size, and check out for a
          receipt. It is all simulated: there is nothing to pay and nothing to fill in.
        </p>
      </header>

      <MerchStore />
    </main>
  );
}
