/**
 * The public front door to a VentureConnect application.
 *
 *   /apply/venture-connect
 *
 * The link that goes on biohubnet.ca, in an email, on a slide. No
 * account, and no triage: the stream question exists to route between
 * two grants, and a link that already says which grant it is has
 * answered it.
 *
 * Two fields, then the form. Name and email are asked here rather than
 * inside the form because they are what the application is addressed
 * to — the link that comes back is the only way into it, and it has to
 * be sendable somewhere.
 */
import type { Metadata } from "next";
import { PublicEquipStart } from "@/components/equip/PublicEquipStart";

export const metadata: Metadata = {
  title: "Apply — EQUIP VentureConnect",
  description:
    "Apply for an EQUIP VentureConnect grant of up to $5,000 CAD to attend a conference, investor event, customer meeting, workshop or pitch competition.",
};

export const dynamic = "force-dynamic";

export default function PublicVentureConnectApplyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
        BioHubNet EQUIP
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">
        VentureConnect application
      </h1>
      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
        Up to <strong className="text-fg">$5,000 CAD</strong> per company towards attending
        one conference, investor event, customer engagement activity, entrepreneurship
        workshop or pitch competition. You do not need a BioHubNet account — start below and
        we will send you a link back to your application.
      </p>

      <div className="mt-5 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-sm font-bold text-fg">Who can apply</h2>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">
          <li>
            A STEM graduate student, postdoctoral fellow or research associate who is a
            founder or holds a leadership role in an early-stage venture.
          </li>
          <li>
            The venture focuses on biomanufacturing or life sciences and demonstrates human
            health impact.
          </li>
          <li>Each company may submit up to three applications, covering one event each.</li>
        </ul>
      </div>

      <div className="mt-5">
        <PublicEquipStart />
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        Questions? Write to{" "}
        <a href="mailto:equip@biohubnet.ca" className="font-semibold text-brand-700 hover:underline">
          equip@biohubnet.ca
        </a>
        .
      </p>
    </main>
  );
}
