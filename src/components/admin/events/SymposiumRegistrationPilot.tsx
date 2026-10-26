import Link from "next/link";
import { ExternalLink, Printer, ShieldCheck } from "lucide-react";
import { SYMPOSIUM_LUMA_ID } from "@/lib/events/print-luma";
import { appendCampaignAttribution, sanitizeCampaignAttribution } from "@/lib/campaign/attribution";

export function SymposiumRegistrationPilot({ searchParams = {} }: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const attribution = sanitizeCampaignAttribution(searchParams);
  const checkoutUrl = appendCampaignAttribution(
    `https://luma.com/embed/event/${SYMPOSIUM_LUMA_ID}/simple`,
    { utm_source: "training-platform-pilot", ...attribution },
  );

  return <section className="mt-6 min-w-0" aria-label="Symposium registration pilot">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="min-w-0 max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg"><ShieldCheck size={16} aria-hidden="true" /> Admin-only pilot</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is the real Luma event, not a payment sandbox. Existing ticket prices, payment setup,
          approval rules and registration dates still apply. This preview does not reopen registration.
        </p>
      </div>
      <Link href="/admin/workspace/symposium-2026/print" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-fg hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2">
        <Printer size={15} aria-hidden="true" /> Guest list &amp; badges
      </Link>
    </div>

    <div className="mt-5 mx-auto w-full max-w-3xl">
      <h2 className="text-lg font-semibold text-fg">BioHubNet 2026 Annual Symposium</h2>
      <p className="mt-1 text-sm text-muted">Registration &amp; secure payment</p>
      {/* Luma owns the entire form and payment flow: never create a second, unpaid local registration. */}
      <iframe
        title="BioHubNet Annual Symposium registration and payment"
        src={checkoutUrl}
        width="100%"
        height="700"
        className="mt-4 block w-full rounded-md border-0 bg-white"
        allow="fullscreen; payment"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Luma issues tickets and receipts. Registrations remain on the existing Luma guest list;
        use Sync Luma in Print Jobs to refresh platform badges. Opening this page does not register anyone.
      </p>
    </div>

    <details className="mt-6 border-t border-line pt-4 text-sm text-muted">
      <summary className="cursor-pointer font-semibold text-fg">Payment &amp; pilot limits</summary>
      <ul className="mt-3 space-y-2 list-disc pl-5 leading-relaxed">
        <li>No card details are collected or stored by the training platform.</li>
        <li>A checkout message or page visit is not proof of payment. Luma remains the payment and approval record.</li>
        <li>Apple Pay is unavailable in Luma embeds. The hosted Luma checkout is required for Apple Pay.</li>
        <li>This pilot is not linked from public registration. Public launch and a live payment test need approval.</li>
      </ul>
      <a href="https://help.luma.com/p/embed-luma-on-your-website" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-1 font-semibold text-fg underline underline-offset-2">
        Luma embed documentation <ExternalLink size={13} aria-hidden="true" />
      </a>
    </details>
  </section>;
}
