/**
 * /admin/equip/tracker — EQUIP Recipient Tracker.
 *
 * Two tabs over one curated dataset (src/lib/equip/recipients.ts — the single
 * source of truth):
 *   • Recipients      — a simplified, public-facing list (company · recipient ·
 *                       track · VL project). Also served verbatim as a JSON feed
 *                       at /api/public/equip/recipients for the BioHubNet site.
 *   • Tracking report — the full post-award intelligence dossier (LinkedIn/web
 *                       tracking, fresh raises/awards, posts & recognition). It's
 *                       a self-contained HTML artifact rendered inside an isolated
 *                       <iframe srcDoc>; the curated data is injected into it at
 *                       render (replacing the __EQUIP_DATA__ placeholder) so the
 *                       dossier and the feed can never drift.
 *
 * To refresh: regenerate the curated set (the dossier's "copy rescan prompt"
 * button has the exact prompt) and paste the new companies into recipients.ts.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Radar } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { EQUIP_UPDATED, toPublicRecipients } from "@/lib/equip/recipients";
import { renderEquipDossierHtml } from "@/lib/equip/dossier";
import { EquipRecipientsSimple } from "@/components/admin/EquipRecipientsSimple";
import { EquipReportShare } from "@/components/admin/equip/EquipReportShare";

export const dynamic = "force-dynamic";

const VIEWS = [
  { id: "recipients", label: "Recipients" },
  { id: "report", label: "Tracking report" },
] as const;

const FEED_PATH = "/api/public/equip/recipients";

export default async function EquipRecipientTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const { view } = await searchParams;
  const active = view === "report" ? "report" : "recipients";

  // Existing external-share links, fetched only for the report view.
  const shareLinks =
    active === "report"
      ? (
          await prisma.equipReportShareToken.findMany({
            orderBy: { createdAt: "desc" },
            select: { id: true, token: true, label: true, expiresAt: true, createdAt: true },
          })
        ).map((l) => ({
          id: l.id,
          token: l.token,
          label: l.label,
          expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
          createdAt: l.createdAt.toISOString(),
        }))
      : [];

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow={<><Radar size={11} /> EQUIP</>}
        title="Recipient tracker"
        description="Every company funded by a VentureConnect or VentureLift grant. Recipients is a simplified public list (also served as a JSON feed for the BioHubNet website); Tracking report is the full LinkedIn/web intelligence dossier."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => {
          const isActive = v.id === active;
          return (
            <Link
              key={v.id}
              href={`/admin/equip/tracker?view=${v.id}`}
              className={
                "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ring-1 transition-colors " +
                (isActive
                  ? "bg-brand-600 text-white ring-brand-700"
                  : "bg-card-solid text-fg ring-line hover:bg-elevated")
              }
            >
              {v.label}
            </Link>
          );
        })}
        <span className="ml-auto text-xs text-fg-subtle">
          Latest scan{" "}
          <time dateTime={EQUIP_UPDATED} className="font-semibold text-fg">
            {new Date(`${EQUIP_UPDATED}T12:00:00Z`).toLocaleDateString("en-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
          </time>
        </span>
      </div>

      {active === "report" ? (
        <>
          <EquipReportShare initialLinks={shareLinks} />
          <div className="overflow-hidden rounded-2xl border border-line bg-[#0d1014] shadow-elevated">
            <iframe
              title="EQUIP Recipient Dossier"
              srcDoc={renderEquipDossierHtml()}
              className="block w-full"
              style={{ height: "calc(100dvh - 240px)", minHeight: 640, border: 0 }}
            />
          </div>
        </>
      ) : (
        <EquipRecipientsSimple
          recipients={toPublicRecipients()}
          updated={EQUIP_UPDATED}
          feedPath={FEED_PATH}
        />
      )}
    </div>
  );
}
