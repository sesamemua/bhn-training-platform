import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  ExternalLink,
  FileSpreadsheet,
  Languages,
  MapPin,
  MousePointerClick,
  PauseCircle,
  Route,
  Search,
  ShieldCheck,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import {
  GOOGLE_ADS_CONVERSION_EVENTS,
  GOOGLE_ADS_LAUNCH_GATES,
  GOOGLE_ADS_PILOT,
  GOOGLE_ADS_PILOT_ASSETS,
  GOOGLE_ADS_PILOT_PROGRAMS,
} from "@/lib/campaign/google-ads-pilot";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHero } from "@/components/ui/PageHero";

export const dynamic = "force-dynamic";

const cad = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-bold text-fg">{title}</h2>
        <p className="mt-0.5 max-w-3xl text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}

function RouteLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {children}
      <ExternalLink size={13} aria-hidden />
    </Link>
  );
}

export default async function GoogleAdsCampaignPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const implementedCount = GOOGLE_ADS_LAUNCH_GATES.filter(
    (gate) => gate.status === "implemented",
  ).length;
  const approvalCount = GOOGLE_ADS_LAUNCH_GATES.length - implementedCount;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={
          <>
            <Search size={11} aria-hidden /> Workspace · Marketing
          </>
        }
        title="Google Ads Campaign"
        description="Internal plan and launch gate for the English Google Search pilot across ENGAGE, EXPERIENCE and EQUIP VentureConnect. Campaign assets remain paused until production tracking and approvals are complete."
        actions={
          <Badge tone="warning" className="px-3 py-1">
            <PauseCircle size={12} aria-hidden /> {GOOGLE_ADS_PILOT.status}
          </Badge>
        }
      />

      <section aria-label="Pilot settings" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Budget ceiling",
            value: `${cad.format(GOOGLE_ADS_PILOT.monthlyBudgetCad)} / month`,
            detail: `${cad.format(GOOGLE_ADS_PILOT.dailyBudgetCad)} / day`,
            icon: <CircleDollarSign size={16} aria-hidden />,
          },
          {
            label: "Network",
            value: GOOGLE_ADS_PILOT.network,
            detail: `${GOOGLE_ADS_PILOT.excludedNetworks.join(" and ")} off`,
            icon: <Search size={16} aria-hidden />,
          },
          {
            label: "Language",
            value: GOOGLE_ADS_PILOT.language,
            detail: "Pilot scope",
            icon: <Languages size={16} aria-hidden />,
          },
          {
            label: "Locations",
            value: GOOGLE_ADS_PILOT.locations.join(" + "),
            detail: GOOGLE_ADS_PILOT.locationMode,
            icon: <MapPin size={16} aria-hidden />,
          },
          {
            label: "Source status",
            value: "Exact + phrase match",
            detail: `Verified ${GOOGLE_ADS_PILOT.lastVerifiedOn}`,
            icon: <ShieldCheck size={16} aria-hidden />,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-line bg-card-solid p-4 shadow-sm">
            <div className="flex items-center gap-2 text-brand-700">
              {item.icon}
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{item.label}</p>
            </div>
            <p className="mt-3 text-sm font-bold leading-5 text-fg">{item.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
          </div>
        ))}
      </section>

      <Card solid>
        <CardHeader>
          <SectionTitle
            icon={<Route size={16} aria-hidden />}
            title="Campaign structure"
            description="One Search campaign per program. Each route begins with institution eligibility and then continues into the platform's existing application workflow."
          />
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full text-left text-sm">
              <caption className="sr-only">Google Ads pilot campaign structure</caption>
              <thead className="border-b border-line bg-raised/70 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3 font-bold">Campaign</th>
                  <th className="px-5 py-3 font-bold">Budget</th>
                  <th className="px-5 py-3 font-bold">Assets</th>
                  <th className="px-5 py-3 font-bold">Measurement</th>
                  <th className="px-5 py-3 font-bold">Routes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {GOOGLE_ADS_PILOT_PROGRAMS.map((program) => (
                  <tr key={program.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-fg">{program.name}</p>
                        <Badge tone="warning">{program.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs font-medium text-brand-700">{program.objective}</p>
                      <p className="mt-2 max-w-sm text-xs leading-5 text-muted">{program.audience}</p>
                      <p className="mt-2 break-all font-mono text-[10px] text-subtle">{program.campaignName}</p>
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      <p className="font-bold text-fg">{cad.format(program.monthlyBudgetCad)}</p>
                      <p className="mt-1 text-xs text-muted">{cad.format(program.dailyBudgetCad)} / day</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-fg">
                        {program.keywordCount} keywords · {program.negativeKeywordCount} negatives
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {program.responsiveSearchAdCount} responsive ads
                      </p>
                      <p className="mt-2 max-w-xs text-xs leading-5 text-muted">
                        {program.adGroups.join(" · ")}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-semibold text-fg">Primary conversion</p>
                      <code className="mt-1 block max-w-xs break-all text-[10px] leading-5 text-brand-700">
                        {program.primaryConversion}
                      </code>
                      <p className="mt-2 text-xs text-muted">utm_campaign={program.utmCampaign}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex max-w-xs flex-wrap gap-2">
                        <RouteLink href={program.landingPath}>Landing page</RouteLink>
                        <RouteLink href={program.applicationPath}>Application</RouteLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card solid>
          <CardHeader>
            <SectionTitle
              icon={<ShieldCheck size={16} aria-hidden />}
              title="Search-intent guardrails"
              description="BioHubNet is the funding, curation and access layer. Delivery partners retain direct course-shopping and registration intent."
            />
          </CardHeader>
          <CardBody className="divide-y divide-line p-0">
            <div className="grid gap-3 px-5 py-4 sm:grid-cols-[9rem_1fr]">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">BioHubNet owns</p>
              <div>
                <p className="font-semibold text-fg">Funding, eligibility and program access</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Training Credits, funded training, institution eligibility, talent-pool access and VentureConnect support.
                </p>
              </div>
            </div>
            <div className="grid gap-3 px-5 py-4 sm:grid-cols-[9rem_1fr]">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Partners own</p>
              <div>
                <p className="font-semibold text-fg">Course choice, schedules, prices and registration</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  CASTL, BioTalent Canada and other delivery partners should capture searches from people ready to choose or register for a specific course.
                </p>
              </div>
            </div>
            <div className="grid gap-3 px-5 py-4 sm:grid-cols-[9rem_1fr]">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Launch control</p>
              <p className="text-sm leading-6 text-muted">
                English Search only, exact and phrase match, presence-only geography, Search Partners and Display disabled. General operating costs, salaries and meals stay excluded from VentureConnect claims.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card solid>
          <CardHeader>
            <SectionTitle
              icon={<FileSpreadsheet size={16} aria-hidden />}
              title="Campaign assets"
              description="Internal source inventory prepared for the pilot. Planning estimates are not Google quotes."
            />
          </CardHeader>
          <CardBody className="divide-y divide-line p-0">
            {GOOGLE_ADS_PILOT_ASSETS.map((asset) => (
              <div key={asset.source} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-fg">{asset.label}</p>
                  <code className="mt-1 block text-[10px] text-muted">{asset.source}</code>
                </div>
                <span className="text-xl font-bold tabular-nums text-fg">{asset.count}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card solid>
        <CardHeader>
          <SectionTitle
            icon={<BarChart3 size={16} aria-hidden />}
            title="Conversion-event mapping"
            description="Page views remain traffic context only. They are not counted as applications; primary conversions require a successfully stored application."
          />
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-sm">
              <caption className="sr-only">Google Ads conversion-event mapping</caption>
              <thead className="border-b border-line bg-raised/70 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3 font-bold">Event</th>
                  <th className="px-5 py-3 font-bold">Stage</th>
                  <th className="px-5 py-3 font-bold">Role</th>
                  <th className="px-5 py-3 font-bold">Evidence</th>
                  <th className="px-5 py-3 font-bold">Trigger</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {GOOGLE_ADS_CONVERSION_EVENTS.map((event) => (
                  <tr key={event.name} className="align-top">
                    <td className="px-5 py-4">
                      <code className="block max-w-xs break-all text-[11px] leading-5 text-brand-700">
                        {event.name}
                      </code>
                    </td>
                    <td className="px-5 py-4 font-semibold text-fg">{event.stage}</td>
                    <td className="px-5 py-4">
                      <Badge tone={event.classification === "Primary" ? "success" : "neutral"}>
                        {event.classification}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted">{event.confirmation}</td>
                    <td className="px-5 py-4 text-xs leading-5 text-muted">{event.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card solid>
        <CardHeader>
          <SectionTitle
            icon={<MousePointerClick size={16} aria-hidden />}
            title="Attribution continuity"
            description="First-party campaign values are sanitized and carried through registration, login, application drafts and final submission."
          />
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {GOOGLE_ADS_PILOT.attributionKeys.map((key) => (
              <code key={key} className="rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-fg">
                {key}
              </code>
            ))}
          </div>
          <div className="mt-5 grid gap-4 border-t border-line pt-5 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Authentication</p>
              <p className="mt-2 text-sm leading-6 text-fg">Attribution is appended to login, registration and callback destinations.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Applications</p>
              <p className="mt-2 text-sm leading-6 text-fg">Draft and public workflows retain the same sanitized first-party attribution object.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Confirmation</p>
              <p className="mt-2 text-sm leading-6 text-fg">Submission events attach attribution only after the application database write succeeds.</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card solid>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            icon={<CheckCircle2 size={16} aria-hidden />}
            title="Launch gate"
            description="Implementation readiness is separate from permission to publish or spend."
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">{implementedCount} implemented</Badge>
            <Badge tone="warning">{approvalCount} approvals pending</Badge>
          </div>
        </CardHeader>
        <CardBody className="grid gap-0 p-0 md:grid-cols-2">
          {GOOGLE_ADS_LAUNCH_GATES.map((gate, index) => {
            const ready = gate.status === "implemented";
            return (
              <div
                key={gate.title}
                className={`flex gap-3 border-line px-5 py-4 ${index > 0 ? "border-t md:border-t-0" : ""} ${index % 2 === 1 ? "md:border-l" : ""} ${index > 1 ? "md:border-t" : ""}`}
              >
                {ready ? (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} aria-hidden />
                ) : (
                  <CircleAlert className="mt-0.5 shrink-0 text-amber-600" size={18} aria-hidden />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-fg">{gate.title}</p>
                    <Badge tone={ready ? "success" : "warning"}>
                      {ready ? "Implemented" : "Approval required"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted">{gate.detail}</p>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
