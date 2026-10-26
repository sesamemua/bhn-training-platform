import { ExternalLink, ShieldCheck } from "lucide-react";

export function SymposiumRegistrationPilot({ credentialsPresent, webhookPresent }: {
  credentialsPresent: boolean;
  webhookPresent: boolean;
}) {
  return <section className="mt-6 min-w-0" aria-label="Symposium registration pilot">
    <div className="max-w-2xl border-l-2 border-amber-500 pl-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg"><ShieldCheck size={16} aria-hidden="true" /> Admin-only pilot · Inactive</p>
      <h2 className="mt-3 text-lg font-semibold text-fg">Direct Stripe connection required</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Registration and attendee records will be managed by BioHubNet, with payments through
        the existing Stripe account. No Luma registration form or checkout is used in this pilot.
      </p>
      <dl className="my-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted">Stripe credentials</dt>
        <dd className="font-semibold text-fg">{credentialsPresent ? "Present; account not yet verified" : "Not configured"}</dd>
        <dt className="text-muted">Webhook signing secret</dt>
        <dd className="font-semibold text-fg">{webhookPresent ? "Present; endpoint not yet verified" : "Not configured"}</dd>
      </dl>
      <p className="text-sm leading-relaxed text-muted">
        Payments and registration remain disabled until the existing merchant account is connected
        directly and verified. Do not create a second Stripe account or disconnect the existing Luma connection.
      </p>
      <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-fg hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2">
        Open existing Stripe account <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  </section>;
}
