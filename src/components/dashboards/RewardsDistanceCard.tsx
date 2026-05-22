/**
 * RewardsDistanceCard — the trainee dashboard's Loot Vault.
 *
 * COMPACTED to roughly half its previous vertical real estate
 * per user request. Reads now as a one-row horizontal strip:
 * credits counter on the left, slim milestone bar with small
 * tier dots in the middle, and a tier-count chip + "Open vault"
 * affordance on the right. Keeps the same 3-stop indigo→
 * violet→fuchsia gradient + amber/fuchsia blob accents so it
 * still reads as the same Loot Vault — just much shorter.
 *
 * Reads `lifetimeSpent()` + `nextTierFor()` from
 * `lib/rewards/merch` so the source of truth stays single with
 * the full `/rewards` arcade page.
 */
import Link from "next/link";
import { ArrowRight, Flame, Crown, Trophy, Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { MERCH_TIERS, lifetimeSpent, nextTierFor } from "@/lib/rewards/merch";

interface Props {
  userId: string;
}

export async function RewardsDistanceCard({ userId }: Props) {
  const [spent, rewards] = await Promise.all([
    lifetimeSpent(prisma, userId),
    prisma.merchReward.findMany({
      where: { userId },
      select: { id: true, tier: true, status: true },
      orderBy: { tier: "asc" },
    }),
  ]);
  const { nextTier } = nextTierFor(spent);

  const journeyTiers = MERCH_TIERS.filter((t) => t.triggeredBy === "credit_threshold")
    .slice()
    .sort((a, b) => a.threshold - b.threshold);
  const journeyMax = journeyTiers[journeyTiers.length - 1]?.threshold ?? 5000;
  const journeyPct = Math.min(100, (spent / journeyMax) * 100);

  const unlockedCount = rewards.length;

  return (
    <Link
      href="/rewards"
      className="loot-scoreboard group relative block overflow-hidden rounded-2xl text-white px-5 sm:px-6 py-4 sm:py-5 shadow-elevated-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      style={{
        background:
          "linear-gradient(135deg, #4338ca 0%, #6d28d9 50%, #be185d 100%)",
      }}
    >
      {/* Compact blob accents for depth */}
      <div aria-hidden className="pointer-events-none absolute -top-10 -right-6 w-32 h-32 rounded-full bg-amber-300/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-6 w-36 h-36 rounded-full bg-fuchsia-500/25 blur-3xl" />

      <div className="relative flex items-center gap-4 sm:gap-6">
        {/* Credits counter — primary metric */}
        <div className="shrink-0">
          <p className="text-[9px] uppercase tracking-[0.24em] font-bold text-white/85 inline-flex items-center gap-1.5">
            <Zap size={10} className="loot-glow text-amber-200" aria-hidden />
            Credits trained
          </p>
          <p className="text-3xl sm:text-4xl font-black leading-none font-mono tabular-nums mt-0.5 drop-shadow-on-dark">
            {spent.toLocaleString()}
            <span aria-hidden className="ml-1.5 text-sm align-top text-amber-200">★</span>
          </p>
        </div>

        {/* Milestone bar + next-tier copy */}
        <div className="flex-1 min-w-0">
          <div className="relative h-2 rounded-full bg-white/15 overflow-visible">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 shadow-glow-amber-strong transition-all"
              style={{ width: `${journeyPct}%` }}
            />
            {journeyTiers.map((t) => {
              const pct = Math.min(100, (t.threshold / journeyMax) * 100);
              const reached = spent >= t.threshold;
              return (
                <span
                  key={t.tier}
                  aria-hidden
                  className={
                    "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-transform group-hover:scale-110 " +
                    (reached
                      ? "bg-amber-200 border-white loot-glow"
                      : "bg-white/15 border-white/40")
                  }
                  style={{ left: `${pct}%` }}
                  title={`Tier ${t.tier} · ${t.threshold.toLocaleString()} credits — ${t.title}`}
                />
              );
            })}
            <span
              aria-hidden
              className="absolute -top-0.5 -translate-x-1/2 w-1 h-3 rounded-full bg-white shadow-glow-white-marker pointer-events-none"
              style={{ left: `${journeyPct}%` }}
            />
          </div>
          <p className="text-[11px] text-white/95 mt-2 inline-flex items-start gap-1.5">
            {nextTier ? (
              <>
                <Flame size={11} className="text-amber-200 shrink-0 mt-0.5 loot-glow" aria-hidden />
                <span>
                  <span className="text-amber-200 font-black">{(nextTier.threshold - spent).toLocaleString()}</span>{" "}
                  more for{" "}
                  <span className="font-bold underline decoration-amber-200/70 decoration-2 underline-offset-2">
                    {nextTier.title}
                  </span>
                </span>
              </>
            ) : (
              <>
                <Crown size={11} className="text-amber-200 shrink-0 mt-0.5 loot-glow" aria-hidden />
                <span className="font-bold">Every tier cleared — Hall-of-Fame.</span>
              </>
            )}
          </p>
        </div>

        {/* Right rail — tier-count chip + open-vault affordance */}
        <div className="hidden sm:flex flex-col items-end shrink-0 gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-black text-white/95 bg-white/15 ring-1 ring-inset ring-white/25 backdrop-blur-sm rounded-full px-2.5 py-1">
            <Trophy size={10} aria-hidden />
            {unlockedCount}/{journeyTiers.length}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-bold text-white/80 group-hover:text-white transition-colors">
            Open vault
            <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
