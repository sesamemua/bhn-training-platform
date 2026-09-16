import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Palette, Sparkles, CheckCircle2, Clock, AlertCircle, Truck, ExternalLink, Gift, MapPin,
} from "lucide-react";
import {
  PROPOSAL_STATUS_META,
  isValidProposalStatus,
  type VoteSentiment,
} from "@/lib/themes/constants";
import { ThemeVotePanel } from "@/components/themes/ThemeVotePanel";
import { ThemeProposalForm } from "@/components/themes/ThemeProposalForm";
import { isPausedPath } from "@/lib/deploy/paused";

// /rewards (where the bundle is claimed) is paused on the production site
// with the rest of ENGAGE (deploy/paused-routes.mjs); point winners at the
// team instead. False wherever nothing is paused.
const REWARDS_PAUSED = isPausedPath("/rewards");
const BUNDLE_CONTACT = "info@biohubnet.ca";

/**
 * /themes — user-facing theme feedback page.
 *
 * Three sections:
 *   1. Your votes (interactive — favourite + least-favourite picker)
 *   2. Got a theme idea? (proposal submission form)
 *   3. Your proposals (status of everything you've submitted; admin
 *      response surfaces here, including the tier-3 bounty when one
 *      is issued)
 *
 * Server-rendered shell + two client islands for the interactive
 * bits. Aggregated vote stats deliberately omitted from this page
 * to preserve voter anonymity at low N — admins see aggregates on
 * /admin/theme-proposals.
 */
export default async function ThemesPage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");
  const userId = (session.user as { id?: string }).id ?? null;
  if (!userId) redirect("/login");

  // Pull the user's current votes + their proposals + a bounty
  // pointer if one was issued.
  const [votes, proposals, bountyReward] = await Promise.all([
    prisma.themeVote.findMany({
      where: { userId },
      select: { themeId: true, sentiment: true },
    }),
    prisma.themeProposal.findMany({
      where: { proposerId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        description: true,
        inspiration: true,
        status: true,
        reviewerNote: true,
        reviewedAt: true,
        shippedThemeId: true,
        bountyIssued: true,
        bountyRewardId: true,
        createdAt: true,
      },
    }),
    prisma.merchReward.findFirst({
      where: { userId, tier: 3 },
      select: { id: true, status: true },
    }),
  ]);

  const favoriteIds = votes
    .filter((v) => v.sentiment === "favorite")
    .map((v) => v.themeId);
  const leastFavoriteIds = votes
    .filter((v) => v.sentiment === "least_favorite")
    .map((v) => v.themeId);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Hero */}
      <section className="rounded-2xl border border-line bg-card p-6 sm:p-8 surface-shadow">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">Theme feedback</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-fg mt-1 tracking-tight inline-flex items-center gap-2">
          <Palette size={22} className="text-brand-600" />
          Your themes, your call
        </h1>
        <p className="text-sm text-muted mt-3 max-w-3xl leading-relaxed">
          Pick up to <span className="font-semibold text-fg">3 themes you love</span> and up to <span className="font-semibold text-fg">3 you don't</span>,
          and pitch ideas for new ones. If we build your idea, you'll earn
          a <span className="font-semibold text-fg">Theme Designer Bundle</span> — a hand-picked thank-you
          delivered through the regular Rewards pickup at the BHN office.
        </p>
      </section>

      {/* Vote panel — client island */}
      <ThemeVotePanel
        initialFavorites={favoriteIds}
        initialLeastFavorites={leastFavoriteIds}
      />

      {/* Proposal submission — client island */}
      <ThemeProposalForm />

      {/* Bounty status — only when one's been issued */}
      {bountyReward && (
        <BountyCallout
          status={bountyReward.status}
        />
      )}

      {/* User's own proposals */}
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6 surface-shadow">
        <h2 className="text-sm font-semibold text-fg mb-3 inline-flex items-center gap-2">
          <Sparkles size={14} className="text-brand-600" />
          Your proposals
        </h2>

        {proposals.length === 0 ? (
          <p className="text-sm text-muted">
            No proposals yet. Submit one above and it'll appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {proposals.map((p) => {
              const statusKey = isValidProposalStatus(p.status) ? p.status : "submitted";
              const meta = PROPOSAL_STATUS_META[statusKey];
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-line bg-elevated p-4"
                  style={{
                    borderLeft: `4px solid ${ragColor(meta.rag)}`,
                  }}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                    <h3 className="text-base font-bold text-fg tracking-tight">{p.title}</h3>
                    <StatusChip rag={meta.rag} label={meta.label} />
                    <span className="text-[11px] text-subtle">
                      Submitted {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted leading-snug mb-2">{meta.description}</p>
                  <p className="text-sm text-fg leading-snug whitespace-pre-line">{p.description}</p>
                  {p.inspiration && (
                    <p className="text-xs text-muted mt-2 leading-snug">
                      <span className="font-semibold text-fg">Inspiration:</span> {p.inspiration}
                    </p>
                  )}
                  {p.reviewerNote && (
                    <div className="mt-3 rounded-lg bg-card border border-line p-3 text-xs leading-snug">
                      <p className="font-semibold text-fg">From the reviewer:</p>
                      <p className="text-muted mt-1 whitespace-pre-line">{p.reviewerNote}</p>
                    </div>
                  )}
                  {statusKey === "shipped" && p.shippedThemeId && (
                    <p className="text-xs text-emerald-700 font-semibold mt-2 inline-flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      Live as theme &quot;{p.shippedThemeId}&quot; — pick it from the theme menu in the sidebar.
                    </p>
                  )}
                  {statusKey === "shipped" && p.bountyIssued && (
                    <p className="text-xs text-violet-700 font-semibold mt-1 inline-flex items-center gap-1">
                      <Gift size={11} />
                      {REWARDS_PAUSED ? (
                        <>Theme Designer Bundle issued — email <a href={`mailto:${BUNDLE_CONTACT}`} className="underline">{BUNDLE_CONTACT}</a> to arrange it.</>
                      ) : (
                        <>Theme Designer Bundle issued — check the <Link href="/rewards" className="underline">Rewards</Link> page.</>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function ragColor(rag: "grey" | "amber" | "sky" | "green" | "rose"): string {
  switch (rag) {
    case "grey":  return "rgba(120,120,120,0.45)";
    case "amber": return "var(--color-amber-400, #f59e0b)";
    case "sky":   return "var(--color-sky-500, #0ea5e9)";
    case "green": return "var(--color-emerald-500, #10b981)";
    case "rose":  return "var(--color-rose-500, #f43f5e)";
  }
}

function StatusChip({
  rag, label,
}: {
  rag: "grey" | "amber" | "sky" | "green" | "rose";
  label: string;
}) {
  const tints: Record<typeof rag, string> = {
    grey:  "bg-elevated text-subtle ring-line",
    amber: "bg-amber-100 text-amber-800 ring-amber-200",
    sky:   "bg-sky-100 text-sky-800 ring-sky-200",
    green: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    rose:  "bg-rose-100 text-rose-800 ring-rose-200",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${tints[rag]}`}
    >
      {label}
    </span>
  );
}

function BountyCallout({ status }: { status: string }) {
  const stateLabel: Record<string, { icon: React.ElementType; tone: string; copy: string }> = {
    UNCLAIMED: {
      icon: Gift,
      tone: "bg-violet-50 ring-violet-200 text-violet-900",
      copy: "Your Theme Designer Bundle is unlocked. Head to Rewards to fill in pickup/shipping details.",
    },
    CLAIMED: {
      icon: Truck,
      tone: "bg-amber-50 ring-amber-200 text-amber-900",
      copy: "Bundle claimed — we're packing it. You'll get an email when it's ready.",
    },
    SHIPPED: {
      icon: MapPin,
      tone: "bg-emerald-50 ring-emerald-200 text-emerald-900",
      copy: "Bundle is ready to pick up at the BHN office (or in transit if you requested mailing).",
    },
    DELIVERED: {
      icon: CheckCircle2,
      tone: "bg-emerald-50 ring-emerald-200 text-emerald-900",
      copy: "Bundle delivered. Wear it well.",
    },
    CANCELLED: {
      icon: AlertCircle,
      tone: "bg-rose-50 ring-rose-200 text-rose-900",
      copy: "Bundle cancelled. Reach out to support if you think this is in error.",
    },
  };
  const meta = stateLabel[status] ?? stateLabel.UNCLAIMED;
  const Icon = meta.icon;

  return (
    <section
      className={`rounded-2xl ring-1 ring-inset p-5 flex items-start gap-3 ${meta.tone}`}
    >
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold opacity-80">Theme Designer Bundle</p>
        <p className="text-sm font-semibold mt-1 leading-snug">{meta.copy}</p>
        <p className="text-xs mt-2 inline-flex items-center gap-1.5">
          <ExternalLink size={11} />
          {REWARDS_PAUSED ? (
            <a href={`mailto:${BUNDLE_CONTACT}`} className="underline font-semibold">Email {BUNDLE_CONTACT} to arrange it</a>
          ) : (
            <Link href="/rewards" className="underline font-semibold">Manage on the Rewards page</Link>
          )}
        </p>
      </div>
    </section>
  );
}

// Suppress unused-import warning on Clock (kept for clarity if status
// states need clocked iconography in a future change).
void Clock;
