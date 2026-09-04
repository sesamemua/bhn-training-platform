"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, ThumbsDown, Loader2, AlertCircle, X } from "lucide-react";
import { THEMES, type ThemeId } from "@/components/ui/ThemeProvider";
import { MAX_VOTES_PER_SENTIMENT } from "@/lib/themes/constants";
import { cn } from "@/lib/utils";

/**
 * Theme voting panel — pick up to MAX_VOTES_PER_SENTIMENT (3)
 * favourites and up to 3 least-favourites.
 *
 * UX rules
 *   • Per-theme card has two buttons (Heart / ThumbsDown). Filled
 *     icon when the theme is in the corresponding set; outline
 *     otherwise.
 *   • Capped buttons (3 votes already picked, this theme not in
 *     the set) are disabled with an explanatory title so users
 *     understand why they can't click.
 *   • Optimistic state. On API failure the local set reverts and
 *     an error banner surfaces.
 *   • Conflict rule mirrors the server: adding a favourite for a
 *     theme you previously disliked silently moves it (and vice
 *     versa). Done client-side so the UI stays consistent without
 *     waiting for a refetch.
 *   • The current-selection card shows chips for each picked
 *     theme; × on a chip removes that one vote.
 */

// Mirror of SWATCH in ThemePicker.tsx. Kept duplicated rather than
// extracted because the picker's Swatch is private to that file.
// If a third surface needs swatches, hoist to a shared module.
const SWATCH: Record<ThemeId, [string, string, string]> = {
  light:      ["#ffffff", "#3b6cef", "#0b1b3b"],
  rosalind:   ["#fbf6ec", "#485940", "#a8625a"],
  hitech:     ["#06121f", "#00d4ff", "#e3f7ff"],
  sakura:     ["#fffaf9", "#d04c61", "#3a1f24"],
  icecream:   ["#fff8f3", "#c5234a", "#b8e0d2"],
  greenwood:  ["#f7faf2", "#456224", "#c6a449"],
  artdeco:    ["#ece0cd", "#4a7b83", "#c98a5f"],
  canada:     ["#ffffff", "#dc1f2d", "#23161a"],
  endofsummer: ["#faf4ea", "#c87f22", "#2a2016"],
  harvest:    ["#f6eee1", "#9f482f", "#5b2735"],
};

function Swatch({ id, size = 36 }: { id: ThemeId; size?: number }) {
  const [card, accent, fg] = SWATCH[id];
  return (
    <span
      className="relative inline-block overflow-hidden border border-line shadow-sm rounded-lg shrink-0"
      style={{ width: size, height: size, background: card }}
    >
      <span
        className="absolute inset-y-0 left-0"
        style={{ width: "45%", background: accent }}
      />
      <span
        className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full"
        style={{ background: fg }}
      />
    </span>
  );
}

interface Props {
  initialFavorites: string[];
  initialLeastFavorites: string[];
}

type Sentiment = "favorite" | "least_favorite";

export function ThemeVotePanel({ initialFavorites, initialLeastFavorites }: Props) {
  const router = useRouter();
  const [favs, setFavs] = useState<Set<string>>(() => new Set(initialFavorites));
  const [leasts, setLeasts] = useState<Set<string>>(() => new Set(initialLeastFavorites));
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addVote(themeId: ThemeId, sentiment: Sentiment) {
    const key = `add:${sentiment}:${themeId}`;
    setBusyKey(key);
    setError(null);

    // Optimistic update mirroring the server's conflict rule:
    // adding to one set silently removes the same theme from the
    // opposite set (you can't both love and dislike a theme).
    const prevFavs = favs;
    const prevLeasts = leasts;
    setFavs((cur) => {
      const next = new Set(cur);
      if (sentiment === "favorite") next.add(themeId);
      else next.delete(themeId);
      return next;
    });
    setLeasts((cur) => {
      const next = new Set(cur);
      if (sentiment === "least_favorite") next.add(themeId);
      else next.delete(themeId);
      return next;
    });

    try {
      const res = await fetch("/api/themes/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, sentiment }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Vote failed");
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setFavs(prevFavs);
      setLeasts(prevLeasts);
    } finally {
      setBusyKey(null);
    }
  }

  async function removeVote(themeId: string, sentiment: Sentiment) {
    const key = `remove:${sentiment}:${themeId}`;
    setBusyKey(key);
    setError(null);

    const prevFavs = favs;
    const prevLeasts = leasts;
    if (sentiment === "favorite") {
      setFavs((cur) => {
        const next = new Set(cur);
        next.delete(themeId);
        return next;
      });
    } else {
      setLeasts((cur) => {
        const next = new Set(cur);
        next.delete(themeId);
        return next;
      });
    }

    try {
      const res = await fetch(
        `/api/themes/vote?themeId=${encodeURIComponent(themeId)}&sentiment=${sentiment}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Remove failed");
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setFavs(prevFavs);
      setLeasts(prevLeasts);
    } finally {
      setBusyKey(null);
    }
  }

  const favAtCap = favs.size >= MAX_VOTES_PER_SENTIMENT;
  const leastAtCap = leasts.size >= MAX_VOTES_PER_SENTIMENT;

  return (
    <section className="rounded-2xl border border-line bg-card p-5 sm:p-6 surface-shadow">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h2 className="text-base font-bold text-fg tracking-tight">Your votes</h2>
        <p className="text-xs text-muted">
          Up to {MAX_VOTES_PER_SENTIMENT} favourites and {MAX_VOTES_PER_SENTIMENT} least-favourites.
          Click an active button to remove it.
        </p>
      </header>

      {/* Current selection summary — chip lists */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <SentimentSummary
          label="Favourites"
          icon={Heart}
          iconClass="text-rose-600"
          chipClass="bg-rose-100 text-rose-800 ring-rose-200"
          themeIds={Array.from(favs)}
          cap={MAX_VOTES_PER_SENTIMENT}
          onRemove={(id) => removeVote(id, "favorite")}
          busyKey={busyKey}
          sentiment="favorite"
        />
        <SentimentSummary
          label="Least favourites"
          icon={ThumbsDown}
          iconClass="text-amber-700"
          chipClass="bg-amber-100 text-amber-800 ring-amber-200"
          themeIds={Array.from(leasts)}
          cap={MAX_VOTES_PER_SENTIMENT}
          onRemove={(id) => removeVote(id, "least_favorite")}
          busyKey={busyKey}
          sentiment="least_favorite"
        />
      </div>

      {error && (
        <div className="mb-4 inline-flex items-start gap-2 text-xs text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-lg px-3 py-2">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Grid of all 13 themes */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const isFav = favs.has(t.id);
          const isLeast = leasts.has(t.id);
          const favBlocked = !isFav && favAtCap;
          const leastBlocked = !isLeast && leastAtCap;
          const favBusy = busyKey === `add:favorite:${t.id}` || busyKey === `remove:favorite:${t.id}`;
          const leastBusy = busyKey === `add:least_favorite:${t.id}` || busyKey === `remove:least_favorite:${t.id}`;
          return (
            <li
              key={t.id}
              className={cn(
                "rounded-xl border bg-elevated p-3 flex flex-col gap-3",
                isFav
                  ? "border-rose-300 ring-1 ring-rose-200"
                  : isLeast
                  ? "border-amber-300 ring-1 ring-amber-200"
                  : "border-line",
              )}
            >
              <div className="flex items-start gap-3">
                <Swatch id={t.id} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-fg tracking-tight leading-tight">{t.name}</p>
                  <p className="text-[11px] text-muted leading-snug line-clamp-2 mt-0.5">{t.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => (isFav ? removeVote(t.id, "favorite") : addVote(t.id, "favorite"))}
                  disabled={busyKey !== null || favBlocked}
                  title={
                    favBlocked
                      ? `Pick up to ${MAX_VOTES_PER_SENTIMENT} favourites — remove one first`
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    isFav
                      ? "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-300 hover:bg-rose-200"
                      : "bg-card text-muted ring-1 ring-inset ring-line hover:bg-card hover:text-rose-700",
                  )}
                  aria-pressed={isFav}
                >
                  {favBusy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Heart size={12} fill={isFav ? "currentColor" : "none"} />
                  )}
                  {isFav ? "Favourite" : "Favour"}
                </button>
                <button
                  type="button"
                  onClick={() => (isLeast ? removeVote(t.id, "least_favorite") : addVote(t.id, "least_favorite"))}
                  disabled={busyKey !== null || leastBlocked}
                  title={
                    leastBlocked
                      ? `Pick up to ${MAX_VOTES_PER_SENTIMENT} least-favourites — remove one first`
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    isLeast
                      ? "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-200"
                      : "bg-card text-muted ring-1 ring-inset ring-line hover:bg-card hover:text-amber-800",
                  )}
                  aria-pressed={isLeast}
                >
                  {leastBusy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ThumbsDown size={12} fill={isLeast ? "currentColor" : "none"} />
                  )}
                  {isLeast ? "Least fav" : "Dislike"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SentimentSummary({
  label, icon: Icon, iconClass, chipClass, themeIds, cap, onRemove, busyKey, sentiment,
}: {
  label: string;
  icon: React.ElementType;
  iconClass: string;
  chipClass: string;
  themeIds: string[];
  cap: number;
  onRemove: (themeId: string) => void;
  busyKey: string | null;
  sentiment: Sentiment;
}) {
  return (
    <div className="rounded-xl border border-line bg-elevated p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={cn("shrink-0", iconClass)} />
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-subtle flex-1">{label}</p>
        <span className="text-[11px] font-mono tabular-nums text-subtle">
          {themeIds.length}/{cap}
        </span>
      </div>
      {themeIds.length === 0 ? (
        <p className="text-xs text-subtle italic">No picks yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {themeIds.map((id) => {
            const themeName =
              THEMES.find((t) => t.id === id)?.name ?? id;
            const busy = busyKey === `remove:${sentiment}:${id}`;
            return (
              <li key={id}>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ring-inset",
                    chipClass,
                  )}
                >
                  {themeName}
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    disabled={busyKey !== null}
                    className="ml-0.5 -mr-0.5 p-0.5 rounded-full hover:bg-card/40 disabled:opacity-40"
                    aria-label={`Remove ${themeName}`}
                  >
                    {busy ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
