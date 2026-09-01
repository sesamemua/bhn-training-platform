/**
 * /merch — the shortlist, shown to someone without an account.
 *
 * The admin board at /admin/merch and /admin/workspace/merch is the
 * buying view: break pricing, setup charges, an estimated unit-cost
 * range, and which tier of visitor each item is meant for. None of that
 * is here. This page is built from `publicCatalogue()`, which is a
 * whitelist — a field added to items.json later stays invisible until
 * somebody puts it on the list.
 *
 * No account, no session, no data written. It exists so the shortlist
 * can be sent to a partner, a supplier or a colleague as a link.
 */
import type { Metadata } from "next";
import { publicCatalogue } from "@/lib/merch/public";
import { MERCH } from "@/lib/merch/types";
import { ExternalLink } from "lucide-react";
import { ProductImage } from "@/components/merch/ProductImage";

export const metadata: Metadata = {
  title: "Merch shortlist — BioHubNet",
  description:
    "The items on BioHubNet's trade-show giveaway shortlist, with a link to each supplier listing.",
  // Not secret, but not something to surface in search either — the page
  // is for people who were sent the link.
  robots: { index: false, follow: false },
};

export default function PublicMerchPage() {
  const items = publicCatalogue();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
        BioHubNet
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">Merch shortlist</h1>
      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
        The items under consideration for BioHubNet events. Each links through to the
        supplier&apos;s own listing, where you can see the full specification and colour
        options.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card"
          >
            {/* Supplier-hosted by design — see the note on imageUrl in
                types.ts. Business Edge currently serves a corrupt file for
                one of these four, so the fallback is load-bearing, not
                defensive. */}
            <ProductImage
              src={item.imageUrl}
              alt={item.name}
              className="h-44 w-full bg-white object-contain p-4"
              fallbackClassName="h-44"
            />

            <div className="flex flex-1 flex-col p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle">
                {item.category}
              </p>
              <h2 className="mt-1 text-[15px] font-bold leading-snug text-fg">{item.name}</h2>
              <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-muted">
                {item.publicBlurb}
              </p>
              <a
                href={item.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-accent hover:underline"
              >
                View on {MERCH.meta.supplier}
                <ExternalLink size={12} aria-hidden />
              </a>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-prose text-[12px] leading-relaxed text-subtle">
        Pricing is not shown here. For quantities, decoration options or a cost estimate,
        ask the BioHubNet team.
      </p>
    </main>
  );
}
