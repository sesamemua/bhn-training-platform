import { requireSession, isStaff as checkIsStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Gift, Lock, CheckCircle2, Truck, Sparkles, MapPin, Trophy, Flame, PartyPopper, Zap, Crown } from "lucide-react";
import {
  MERCH_TIERS,
  PICKUP_LOCATION,
  ensureMerchUnlocks,
  lifetimeSpent,
  nextTierFor,
} from "@/lib/rewards/merch";
import { MerchClaimDialog } from "@/components/rewards/MerchClaimDialog";
import { EditableText } from "@/components/cms/EditableText";
import { getCopyMap } from "@/lib/copy";
import { PageHero } from "@/components/ui/PageHero";

/**
 * /rewards — trainee-facing loyalty page.
 *
 * Trainee path: progress counter + tier cards + claim form.
 *
 * Non-trainee path (admins, superadmins, instructors, employers,
 * sandbox/demo accounts): rather than redirect — which is the
 * textbook role-gating UX anti-pattern (user clicked a link, ended
 * up somewhere else, no explanation) — we render an "informed empty
 * state". It confirms identity ("yes, this is Rewards"), explains
 * the mismatch (you don't earn merch yourself), and gives concrete
 * next-steps: the admin queue at /admin/merch, plus for superadmins
 * the existing "View as trainee" role switcher.
 *
 * Lazy backfill: ensureMerchUnlocks runs on the trainee path on
 * every load so a trainee who crosses a threshold via legacy data
 * (or whose enroll-time hook missed) still sees the unlock the next
 * time they visit.
 */
export default async function RewardsPage() {
  const session = await requireSession().catch(() => null);
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string }).id!;
  const role = (session.user as { role?: string }).role ?? "trainee";
  const realRole = (session.user as { realRole?: string }).realRole ?? role;

  // /rewards renders identically for every role. Non-trainees won't
  // typically have credit-threshold debits, so they see the page in
  // its empty state (zero credits trained, every tier locked) —
  // which is the correct depiction of their own loyalty status, and
  // makes the page useful as a preview surface for admins without a
  // separate "informed empty state" landing.
  await ensureMerchUnlocks(prisma, userId);

  const [user, rewards, spent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        country: true,
        phone: true,
      },
    }),
    prisma.merchReward.findMany({
      where: { userId },
      orderBy: { tier: "asc" },
    }),
    lifetimeSpent(prisma, userId),
  ]);

  const { nextTier } = nextTierFor(spent);
  const unlockedCount = rewards.length;
  const claimedCount = rewards.filter((r) => r.status !== "UNCLAIMED").length;

  // Build the "journey" — a sorted list of credit-threshold tiers so
  // the progress bar can render milestone markers at each one. The
  // bar's overall width represents lifetime credits trained, capped
  // at the top tier so the marker never falls off the right edge.
  const journeyTiers = MERCH_TIERS.filter((t) => t.triggeredBy === "credit_threshold")
    .slice()
    .sort((a, b) => a.threshold - b.threshold);
  const journeyMax = journeyTiers[journeyTiers.length - 1]?.threshold ?? 5000;
  const journeyPct = Math.min(100, (spent / journeyMax) * 100);

  const heroTitleDefault = "Train hard. Earn the loot.";
  const heroBodyDefault = "Every credit you spend on coursework drops you closer to the next reward bundle. Pick up your spoils at Leslie Dan Faculty of Pharmacy, U of T — or ask for mailing in the claim form.";
  const heroCopy = await getCopyMap(["rewards.heroTitle", "rewards.heroBody"]);
  const heroTitle = heroCopy["rewards.heroTitle"] ?? heroTitleDefault;
  const heroBody = heroCopy["rewards.heroBody"] ?? heroBodyDefault;
  // Real role gates the pencil — an admin viewing-as-trainee should
  // still be able to edit the hero copy without flipping seats first.
  const editableIsStaff = checkIsStaff(realRole);

  return (
    <div>
      <PageHero
        eyebrow={<><Gift size={12} /> Loot vault</>}
        title={heroTitle}
        description={
          <EditableText copyKey="rewards.heroBody" defaultText={heroBody} isStaff={editableIsStaff} />
        }
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
        {/* ───────────────────────── SCOREBOARD ─────────────────────────
            Big celebratory headline panel — rainbow gradient, floating
            gift glyphs around the edges, gigantic credits counter, three
            stat tiles, and the milestone quest line at the bottom. The
            tone is meant to read as a wall-mounted leaderboard at an
            arcade, not a corporate "your loyalty status" tile. */}
        <section
          className="loot-scoreboard relative overflow-hidden rounded-[2rem] text-white px-6 sm:px-10 py-10 sm:py-12 surface-shadow"
          style={{
            background:
              "linear-gradient(135deg, #4338ca 0%, #6d28d9 22%, #be185d 50%, #f97316 78%, #fbbf24 100%)",
          }}
        >
          {/* Soft blob accents to add depth on top of the gradient */}
          <div aria-hidden className="pointer-events-none absolute -top-20 -right-12 w-72 h-72 rounded-full bg-amber-300/40 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-12 w-80 h-80 rounded-full bg-fuchsia-500/35 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 w-64 h-64 -translate-x-1/2 rounded-full bg-sky-400/25 blur-3xl" />

          {/* Floating gift / sparkle glyphs around the corners */}
          <div aria-hidden className="pointer-events-none absolute top-6 right-8 hidden sm:block loot-float text-amber-200">
            <Gift size={36} strokeWidth={1.5} />
          </div>
          <div aria-hidden className="pointer-events-none absolute top-12 left-10 hidden md:block loot-float-slow text-pink-200">
            <Sparkles size={26} strokeWidth={1.5} />
          </div>
          <div aria-hidden className="pointer-events-none absolute bottom-8 right-1/4 hidden md:block loot-float text-white">
            <PartyPopper size={28} strokeWidth={1.5} />
          </div>

          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-white/80 inline-flex items-center gap-2">
              <Zap size={12} className="loot-glow text-amber-200" />
              Credits trained
            </p>
            <p className="text-6xl sm:text-7xl lg:text-8xl font-black leading-[0.95] font-mono tabular-nums mt-2 drop-shadow-on-dark-lg">
              {spent.toLocaleString()}
              <span className="ml-3 text-2xl sm:text-3xl align-top text-amber-200">★</span>
            </p>

            {/* Stat tiles — frosted glass on the vibrant gradient */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-7">
              <Stat label="Tiers unlocked" value={`${unlockedCount} / ${journeyTiers.length}`} icon={Trophy} />
              <Stat label="Claimed & on the way" value={String(claimedCount)} icon={CheckCircle2} />
              <Stat
                label={nextTier ? "Credits to next loot" : "Status"}
                value={nextTier ? (nextTier.threshold - spent).toLocaleString() : "Maxed out!"}
                icon={nextTier ? Flame : Crown}
                accent={!nextTier}
              />
            </div>

            {/* Milestone bar — fat, glowing, with playful tier markers */}
            <div className="mt-9">
              <div className="relative h-4 rounded-full bg-white/15 overflow-visible">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400 shadow-glow-amber-bar transition-all"
                  style={{ width: `${journeyPct}%` }}
                />
                {journeyTiers.map((t) => {
                  const pct = Math.min(100, (t.threshold / journeyMax) * 100);
                  const reached = spent >= t.threshold;
                  return (
                    <div
                      key={t.tier}
                      className="absolute -top-3 -translate-x-1/2"
                      style={{ left: `${pct}%` }}
                    >
                      <div
                        className={
                          "w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg border-2 transition-transform " +
                          (reached
                            ? "bg-amber-200 border-white text-amber-900 hover:scale-110 loot-glow"
                            : "bg-white/15 border-white/40 text-white/70 backdrop-blur")
                        }
                        title={`Tier ${t.tier} · ${t.threshold.toLocaleString()} credits — ${t.title}`}
                      >
                        {reached ? "★" : t.tier}
                      </div>
                    </div>
                  );
                })}
                {/* You-are-here marker — taller pin */}
                <div
                  aria-hidden
                  className="absolute -top-3 -translate-x-1/2 pointer-events-none"
                  style={{ left: `${journeyPct}%` }}
                >
                  <div className="w-2.5 h-10 rounded-full bg-white shadow-glow-white-marker" />
                </div>
              </div>

              <p className="text-sm text-white/95 mt-8 inline-flex items-start gap-2">
                {nextTier ? (
                  <>
                    <Flame size={16} className="text-amber-200 shrink-0 mt-0.5 loot-glow" />
                    <span>
                      <span className="text-amber-200 font-black text-base">{(nextTier.threshold - spent).toLocaleString()}</span>{" "}
                      more credits and <span className="font-bold underline decoration-amber-200/70 decoration-2 underline-offset-4">{nextTier.title}</span> drops.
                    </span>
                  </>
                ) : (
                  <>
                    <Crown size={16} className="text-amber-200 shrink-0 mt-0.5 loot-glow" />
                    <span className="font-bold">You&apos;ve cleared every tier. Hall-of-Fame energy.</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────── COLLECTIBLE LOOT CARDS ───────────────────
            Each tier renders as a rounded loot card with a foil
            shimmer band, a big emoji, a rarity badge, and a state-
            specific footer. Unlocked-but-unclaimed cards have a
            pulsing CLAIM button; the rest pivot to their lifecycle
            state (packing / on the way / picked up / delivered /
            cancelled). */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MERCH_TIERS.map((t) => {
            const reward = rewards.find((r) => r.tier === t.tier) ?? null;
            const locked = !reward;
            const remaining = Math.max(0, t.threshold - spent);
            const unclaimed = !locked && reward!.status === "UNCLAIMED";
            const rarity = tierRarity(t.tier);
            const emoji = tierEmoji(t.tier);

            return (
              <article
                key={t.tier}
                className={
                  "loot-card relative overflow-hidden rounded-3xl flex flex-col surface-shadow " +
                  (locked
                    ? "bg-card border border-line"
                    : "bg-card border-2")
                }
                style={
                  locked
                    ? undefined
                    : {
                        borderColor: t.accent,
                        boxShadow: `0 0 0 1px ${t.accent}33, 0 18px 40px -16px ${t.accent}88`,
                      }
                }
              >
                {/* Top accent strip — solid hex for unlocked, muted
                    for locked. Gives the card silhouette per-tier
                    identity. */}
                <div
                  className="h-2 w-full"
                  style={{ background: locked ? "var(--line-strong)" : t.accent }}
                  aria-hidden
                />

                {/* Foil shimmer band — only on unlocked tiers, runs
                    horizontally across the upper third on a loop. */}
                {!locked && (
                  <div
                    aria-hidden
                    className="loot-shimmer absolute top-2 left-0 right-0 h-32 pointer-events-none opacity-50"
                  />
                )}

                {/* Decorative blurred halo, theme-coloured */}
                {!locked && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-14 -right-14 w-44 h-44 rounded-full blur-3xl opacity-30"
                    style={{ background: t.accent }}
                  />
                )}

                <div className="relative p-5 sm:p-6 flex flex-col flex-1">
                  {/* Header — emoji tile + rarity + state */}
                  <header className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={
                          "shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-md " +
                          (locked ? "bg-elevated grayscale opacity-70" : "")
                        }
                        style={
                          locked
                            ? undefined
                            : {
                                background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
                                color: "white",
                              }
                        }
                      >
                        {emoji}
                      </span>
                      <div className="min-w-0">
                        <p
                          className="text-[10px] uppercase tracking-[0.22em] font-black"
                          style={{ color: locked ? "var(--fg-subtle)" : t.accent }}
                        >
                          Tier {t.tier} · {rarity}
                        </p>
                        <h2 className="text-lg sm:text-xl font-black text-fg mt-0.5 tracking-tight leading-tight">
                          {t.title}
                        </h2>
                      </div>
                    </div>
                    <StateChip state={locked ? "LOCKED" : reward!.status} />
                  </header>

                  <p className="text-sm text-muted leading-snug mb-4">{t.blurb}</p>

                  <ul className="space-y-1.5 mb-5">
                    {t.items.map((item) => (
                      <li key={item} className="text-xs text-fg flex items-start gap-2 leading-snug">
                        <Sparkles
                          size={12}
                          className="shrink-0 mt-0.5"
                          style={{ color: locked ? "var(--fg-subtle)" : t.accent }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Footer — state-driven action / status block */}
                  <div className="mt-auto">
                    {locked ? (
                      <div
                        className="rounded-2xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-2"
                        style={{
                          background: "var(--elevated)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Lock size={12} />
                          {remaining.toLocaleString()} credits to crack open
                        </span>
                        <span className="font-mono text-fg-subtle">
                          {Math.min(99, Math.round((spent / t.threshold) * 100))}%
                        </span>
                      </div>
                    ) : unclaimed ? (
                      <div className="space-y-2">
                        <div
                          className="rounded-2xl px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] inline-flex items-center gap-2 loot-pulse"
                          style={{
                            background: `linear-gradient(135deg, ${t.accent}, ${t.accent}dd)`,
                            color: "white",
                          }}
                        >
                          <PartyPopper size={12} />
                          Unlocked — claim it!
                        </div>
                        <MerchClaimDialog
                          rewardId={reward!.id}
                          tierTitle={t.title}
                          items={t.items}
                          defaults={{
                            recipientName: user?.name ?? "",
                            country: user?.country ?? "",
                            phone: user?.phone ?? "",
                          }}
                        />
                      </div>
                    ) : reward!.status === "CLAIMED" ? (
                      <div className="text-xs bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 rounded-2xl px-4 py-3 leading-snug">
                        {reward!.fulfillmentMethod === "PICKUP" ? (
                          <>
                            <MapPin size={12} className="inline -mt-0.5 mr-1" />
                            We&apos;re packing your loot. You&apos;ll get an email when it&apos;s
                            ready to pick up at {PICKUP_LOCATION.short}.
                          </>
                        ) : (
                          <>
                            <Truck size={12} className="inline -mt-0.5 mr-1" />
                            Mailing requested — an admin&apos;s lining up postage.
                            We&apos;ll email a confirmation (or quote) before sending.
                          </>
                        )}
                      </div>
                    ) : reward!.status === "SHIPPED" ? (
                      <div className="text-xs bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 rounded-2xl px-4 py-3 leading-snug space-y-1">
                        {reward!.fulfillmentMethod === "PICKUP" ? (
                          <p>
                            <MapPin size={12} className="inline -mt-0.5 mr-1" />
                            <span className="font-bold">Ready for pickup!</span>{" "}
                            Swing by Leslie Dan Faculty of Pharmacy, U of T —
                            bring this page or your name.
                          </p>
                        ) : (
                          <>
                            <p>
                              <Truck size={12} className="inline -mt-0.5 mr-1" />
                              Shipped {reward!.shippedAt ? new Date(reward!.shippedAt).toLocaleDateString() : ""}
                              {reward!.carrier && <> via {reward!.carrier}</>}.
                            </p>
                            {reward!.trackingUrl ? (
                              <a
                                href={reward!.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-900 underline font-bold break-all"
                              >
                                Track: {reward!.trackingNumber}
                              </a>
                            ) : reward!.trackingNumber ? (
                              <p className="font-mono">Tracking: {reward!.trackingNumber}</p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : reward!.status === "DELIVERED" ? (
                      <div className="text-xs bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 rounded-2xl px-4 py-3 font-bold inline-flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        {reward!.fulfillmentMethod === "PICKUP"
                          ? "Picked up. Wear it loud!"
                          : "Delivered. Enjoy the spoils!"}
                      </div>
                    ) : reward!.status === "CANCELLED" ? (
                      <div className="text-xs bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 rounded-2xl px-4 py-3 leading-snug">
                        Cancelled.
                        {reward!.cancelledReason && <> {reward!.cancelledReason}</>}
                        <br />
                        Reach out to support@biohubnet.ca to re-issue.
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* ─────────────────────── PICKUP CARD ───────────────────────
            A small playful sign-post for where to grab the loot in
            person. Lives on a tinted brand wash so it reads as part of
            the same arcade page rather than a tax receipt. */}
        <section
          className="relative overflow-hidden rounded-3xl px-5 sm:px-8 py-6 surface-shadow flex items-start gap-4"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--brand-500) 18%, var(--card)) 0%, var(--card) 60%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-40"
            style={{ background: "var(--brand-400)" }}
          />
          <div
            className="relative shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md loot-float-slow"
            style={{ background: "var(--brand-600)" }}
          >
            <MapPin size={20} />
          </div>
          <div className="relative flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] font-black text-brand-700">
              Where to grab your loot
            </p>
            <p className="text-base sm:text-lg font-bold text-fg mt-1 tracking-tight">
              {PICKUP_LOCATION.org}
            </p>
            <p className="text-sm text-fg">
              {PICKUP_LOCATION.building}, {PICKUP_LOCATION.university}
            </p>
            <p className="text-xs text-muted mt-2 leading-snug">
              Default for every reward. Outside the GTA? Tick the mailing
              option inside the claim form — an admin reviews each request
              and confirms postage (Canada at-cost; international quoted
              first).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Pick a "rarity" label per tier — gives each loot card collectible-
 *  game energy without inventing a new schema field. */
function tierRarity(tier: number): string {
  if (tier <= 1) return "Common drop";
  if (tier === 2) return "Rare drop";
  return "Legendary drop";
}

/** Per-tier emoji used as the big card glyph. Falls back to a gift box
 *  for any future tier we haven't mapped yet. */
function tierEmoji(tier: number): string {
  const map: Record<number, string> = {
    1: "🎒",
    2: "💧",
    3: "🎨",
  };
  return map[tier] ?? "🎁";
}


/**
 * Frosted stat tile used in the scoreboard. Sits on the vibrant
 * gradient via a translucent white wash + crisp inner border so it
 * reads as a 3D embedded chip rather than flat text. `accent=true`
 * tilts the tile toward the celebratory amber (used when there's no
 * "next tier" — i.e. the trainee has cleared every milestone).
 */
function Stat({
  label, value, icon: Icon, accent = false,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl px-4 py-3 backdrop-blur-sm ring-1 ring-inset " +
        (accent
          ? "bg-amber-200/25 ring-amber-200/60"
          : "bg-white/15 ring-white/25")
      }
    >
      <p className="text-[10px] uppercase tracking-[0.22em] font-black text-white/80 inline-flex items-center gap-1.5">
        <Icon size={12} />
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-black text-white leading-tight font-mono tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
}

/** Compact status pill matching the card's lifecycle state. */
function StateChip({ state }: { state: string }) {
  const styles: Record<string, string> = {
    LOCKED:    "bg-elevated text-subtle ring-line",
    UNCLAIMED: "bg-amber-200 text-amber-900 ring-amber-300",
    CLAIMED:   "bg-amber-100 text-amber-800 ring-amber-200",
    SHIPPED:   "bg-emerald-100 text-emerald-800 ring-emerald-200",
    DELIVERED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    CANCELLED: "bg-rose-100 text-rose-800 ring-rose-200",
  };
  const label: Record<string, string> = {
    LOCKED:    "Locked",
    UNCLAIMED: "★ Drop ready",
    CLAIMED:   "Packing",
    SHIPPED:   "On the way",
    DELIVERED: "Got it!",
    CANCELLED: "Cancelled",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-black uppercase tracking-[0.16em] px-2.5 py-1 rounded-full ring-1 ring-inset shrink-0 ${styles[state] ?? styles.LOCKED}`}
    >
      {label[state] ?? state}
    </span>
  );
}
