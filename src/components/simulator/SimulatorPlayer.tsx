"use client";

/**
 * SimulatorPlayer — the interactive loop.
 *
 * Three-column layout on xl+:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Week progress strip (1–12, with current week highlighted)    │
 *   ├──────────────┬─────────────────────────────────┬─────────────┤
 *   │ Dashboard    │ Scenario card                   │ Roster       │
 *   │ (5 stats)    │ (setting + prompt + choices)    │ (15 names)   │
 *   └──────────────┴─────────────────────────────────┴─────────────┘
 *
 * On lg the dashboard collapses into the right rail above the roster.
 * Below lg, everything stacks single-column.
 *
 * Polish notes:
 *   • Display font used for scenario titles (theme-aware via --font-display-theme).
 *   • Paper-texture background on the scenario card (subtle radial vignette).
 *   • Choice buttons surface stat-delta chips on hover so the tradeoff is visible
 *     before commitment.
 *   • Roster rows have a head-silhouette avatar and click → anchored popup.
 *   • Review screen animates the score from 0 to final and shows stat deltas
 *     from starting values.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import {
  Activity,
  ArrowRight,
  Battery,
  BookOpen,
  CalendarDays,
  Compass,
  Flag,
  Loader2,
  Network,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  applyChoice,
  computeDecisionProfile,
  computeReview,
  rewindToWeek,
} from "@/lib/simulator/engine";
import { Avatar as PersonAvatar } from "./Avatar";
import type {
  AttemptState,
  AttemptStats,
  LogEntry,
  Person,
  Scenario,
  SimulationPayload,
  StatDef,
} from "@/lib/simulator/types";

type Props = {
  /** Present in the normal authenticated flow (a real DB attempt). */
  attemptId?: string;
  payload: SimulationPayload;
  initialState: AttemptState;
  /**
   * When set, the player runs ENTIRELY client-side: every choice is
   * resolved locally via the pure engine and progress is checkpointed
   * to localStorage instead of the database. Used by the public,
   * no-login share page (`/share/sim/[token]`) so anonymous visitors
   * can actually play without an account or a server-side attempt.
   */
  guest?: { token: string };
};

const STAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  morale: Users,
  vpTrust: TrendingUp,
  velocity: Activity,
  crossFunc: Network,
  capacity: Battery,
};

export function SimulatorPlayer({
  attemptId,
  payload,
  initialState,
  guest,
}: Props) {
  const [state, setState] = useState<AttemptState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState<{
    choiceIdx: number;
    label: string;
    outcome: string;
  } | null>(null);
  const [hoverEffect, setHoverEffect] = useState<Record<string, number> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  // First-visit welcome / mini-tour. Gated by localStorage per
  // attemptId so a player who closed the modal mid-quarter doesn't
  // see it again on reload. SSR-safe: starts false, the effect below
  // promotes to true on the client only if no dismissal flag exists.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // Whether the player has opened the briefing yet — drives the
  // "read this first" emphasis on the briefing card (calms once read).
  const [briefingSeen, setBriefingSeen] = useState(false);
  // Which past week's review modal is open (null = none) — the
  // "go back to a previous week" entry point.
  const [reviewWeek, setReviewWeek] = useState<number | null>(null);

  // Stable keys for the one-time welcome modal + (guest) progress
  // checkpoint. Authed attempts key on the attempt id; guest plays key
  // on the share token.
  const welcomeKey = guest
    ? `sim:welcome:guest:${guest.token}`
    : `sim:welcome:${attemptId}`;
  const briefingSeenKey = guest
    ? `sim:briefing-seen:guest:${guest.token}`
    : `sim:briefing-seen:${attemptId}`;
  const guestStateKey = guest ? `bhn-sim-guest:${guest.token}` : null;

  function persistGuest(next: AttemptState) {
    if (!guestStateKey || typeof window === "undefined") return;
    try {
      localStorage.setItem(guestStateKey, JSON.stringify(next));
    } catch {}
  }

  // Guest resume — rehydrate any in-progress state from a previous
  // visit (the no-login player has no server checkpoint).
  useEffect(() => {
    if (!guestStateKey || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(guestStateKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as AttemptState;
      if (
        saved &&
        typeof saved.week === "number" &&
        saved.stats &&
        Array.isArray(saved.log)
      ) {
        setState(saved);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestStateKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(welcomeKey)) setWelcomeOpen(true);
  }, [welcomeKey]);
  function dismissWelcome() {
    setWelcomeOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(welcomeKey, "dismissed");
    }
  }

  // Briefing-seen flag — hydrate once, then `openBriefing` opens the
  // modal and records that it's been read (so the "read this first"
  // emphasis on the briefing card calms down afterwards).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(briefingSeenKey)) setBriefingSeen(true);
  }, [briefingSeenKey]);
  function openBriefing() {
    setBriefingOpen(true);
    setBriefingSeen(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(briefingSeenKey, "1");
      } catch {}
    }
  }

  const router = useRouter();

  const scenarios = payload.scenarios.filter((s) => s.week === state.week);
  const scenario: Scenario | undefined = scenarios[state.scenarioIndex];
  const pendingNextRef = useRef<AttemptState | null>(null);

  async function makeChoice(idx: number) {
    if (!scenario || submitting) return;
    setError(null);

    // Guest mode: resolve the choice locally with the same pure engine
    // the server uses — no network, progress saved to localStorage.
    if (guest) {
      const result = applyChoice(payload, state, idx);
      if (!result) {
        setError("That choice isn't available.");
        return;
      }
      setResolved({
        choiceIdx: idx,
        label: result.entry.choiceLabel,
        outcome: result.entry.outcome,
      });
      pendingNextRef.current = result.state;
      persistGuest(result.state);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/simulator/${attemptId}/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choiceIndex: idx }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        week?: number;
        scenarioIndex?: number;
        stats?: AttemptStats;
        finished?: boolean;
        entry?: LogEntry;
        error?: string;
      };
      if (!res.ok || !data.entry) {
        throw new Error(data.error ?? "Failed to record choice");
      }
      setResolved({
        choiceIdx: idx,
        label: data.entry.choiceLabel,
        outcome: data.entry.outcome,
      });
      pendingNextRef.current = {
        week: data.week ?? state.week,
        scenarioIndex: data.scenarioIndex ?? state.scenarioIndex,
        stats: data.stats ?? state.stats,
        log: [...state.log, data.entry],
        finished: !!data.finished,
      };
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinue() {
    if (!pendingNextRef.current) return;
    setState(pendingNextRef.current);
    pendingNextRef.current = null;
    setResolved(null);
  }

  async function handleReset() {
    if (
      !confirm(
        "Reset back to week 1 with starting stats? Your decision log will be cleared.",
      )
    ) {
      return;
    }
    const stats: AttemptStats = {};
    for (const s of payload.stats) stats[s.key] = s.initialValue;
    const fresh: AttemptState = {
      week: 1,
      scenarioIndex: 0,
      stats,
      log: [],
      finished: false,
    };

    // Guest mode: reset locally, no server round-trip.
    if (guest) {
      setState(fresh);
      setResolved(null);
      pendingNextRef.current = null;
      persistGuest(fresh);
      return;
    }

    const res = await fetch(`/api/simulator/${attemptId}/reset`, {
      method: "POST",
    });
    if (res.ok) {
      // Reset local state without round-tripping through Prisma — we
      // know the initial state from the payload.
      setState(fresh);
      setResolved(null);
      pendingNextRef.current = null;
      router.refresh();
    }
  }

  // Go back to a previous week — rewind to its start, keeping earlier
  // decisions and discarding everything from that week onward so the
  // player can replay a different path.
  async function handleRewind(week: number) {
    if (
      !confirm(
        `Go back to week ${week}? Your decisions from week ${week} onward will be cleared so you can replay from there — earlier weeks are kept.`,
      )
    ) {
      return;
    }
    const next = rewindToWeek(payload, state, week);
    const apply = () => {
      setState(next);
      setResolved(null);
      pendingNextRef.current = null;
      setReviewWeek(null);
    };

    if (guest) {
      apply();
      persistGuest(next);
      return;
    }

    try {
      const res = await fetch(`/api/simulator/${attemptId}/rewind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      });
      if (!res.ok) throw new Error();
      apply();
      router.refresh();
    } catch {
      setError("Couldn't go back. Please try again.");
    }
  }

  // Review view when finished
  if (state.finished) {
    return (
      <ReviewView
        payload={payload}
        state={state}
        attemptId={attemptId}
        guest={!!guest}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero band — role context */}
      <RoleHeader payload={payload} onReset={handleReset} />

      {/* The first thing to do — a prominent, click-to-open briefing. */}
      <BriefingCallout
        payload={payload}
        seen={briefingSeen}
        onOpen={openBriefing}
      />

      {briefingOpen && payload.briefing && (
        <BriefingModal
          payload={payload}
          onClose={() => setBriefingOpen(false)}
        />
      )}

      {welcomeOpen && (
        <WelcomeModal
          payload={payload}
          onClose={dismissWelcome}
          onOpenBriefing={
            payload.briefing
              ? () => {
                  dismissWelcome();
                  openBriefing();
                }
              : undefined
          }
        />
      )}

      {reviewWeek !== null && (
        <WeekReviewModal
          payload={payload}
          log={state.log}
          week={reviewWeek}
          onClose={() => setReviewWeek(null)}
          onRewind={handleRewind}
        />
      )}

      {/* Week progress strip — tap a past week to revisit it */}
      <WeekStrip
        currentWeek={state.week}
        scenarios={payload.scenarios}
        log={state.log}
        onReviewWeek={setReviewWeek}
      />

      {/* Three-column body */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px] xl:grid-cols-[260px_1fr_320px]">
        <aside className="hidden xl:block">
          <DashboardCard
            payload={payload}
            stats={state.stats}
            hover={hoverEffect}
            week={state.week}
          />
        </aside>

        <div className="min-w-0 space-y-4">
          {scenario ? (
            <ScenarioPanel
              scenario={scenario}
              resolved={resolved}
              submitting={submitting}
              onChoose={makeChoice}
              onHoverChoice={setHoverEffect}
              onContinue={handleContinue}
            />
          ) : (
            <Card className="p-6 text-sm text-fg-muted">
              No scenario for week {state.week}. Click Continue to advance.
            </Card>
          )}

          {error && (
            <Card className="border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              {error}
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <div className="xl:hidden">
            <DashboardCard
              payload={payload}
              stats={state.stats}
              hover={hoverEffect}
              week={state.week}
            />
          </div>
          <RosterPanel payload={payload} />
        </aside>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Role header — sets the tone for the whole quarter
// ────────────────────────────────────────────────────────────────────

function RoleHeader({
  payload,
  onReset,
}: {
  payload: SimulationPayload;
  onReset: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line/70 bg-card-solid px-6 py-6 md:px-7 md:py-7">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-[12px] text-fg-subtle">
            RPG · Q1
          </div>
          <h1
            className="mb-1.5 text-[26px] font-semibold leading-[1.15] tracking-tight text-fg md:text-[30px]"
            style={{ fontFamily: "var(--font-display-theme, inherit)" }}
          >
            {payload.jobTitle}
          </h1>
          {(payload.companyName || payload.location) && (
            <p className="text-[13.5px] text-fg-muted">
              {payload.companyName}
              {payload.location && (
                <>
                  {payload.companyName ? " · " : ""}
                  {payload.location}
                </>
              )}
            </p>
          )}
          {payload.context && (
            <p className="mt-4 max-w-2xl text-[14px] leading-[1.65] text-fg-muted">
              {payload.context}
            </p>
          )}
          <p className="mt-3 text-[12.5px] text-fg-subtle">
            Reporting to{" "}
            <span className="text-fg-muted">{payload.vpName}</span>
            , {payload.vpRole}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <button
            onClick={onReset}
            className="text-[11.5px] text-fg-subtle transition hover:text-fg-muted"
          >
            Reset quarter
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Briefing callout — the prominent "read this first" entry point.
// Styled as a full-width card (not a button) but fully clickable; the
// "Start here" emphasis (accent border, pulsing dot) calms to a quiet
// "Reopen" state once the player has opened the briefing.
// ────────────────────────────────────────────────────────────────────

function BriefingCallout({
  payload,
  seen,
  onOpen,
}: {
  payload: SimulationPayload;
  seen: boolean;
  onOpen: () => void;
}) {
  const b = payload.briefing;
  if (!b) return null;
  const meta = [
    b.failureModes?.length ? `${b.failureModes.length} failure modes` : null,
    b.unwrittenRules?.length
      ? `${b.unwrittenRules.length} unwritten rules`
      : null,
    b.interviewQuestions?.length
      ? `${b.interviewQuestions.length} questions to ask`
      : null,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the briefing — what the job won't tell you"
      className={[
        "group relative block w-full overflow-hidden rounded-[var(--radius-lg)] border text-left transition",
        seen
          ? "border-line/70 bg-card-solid hover:border-brand-400/70 hover:bg-raised/20"
          : "border-brand-300/70 bg-gradient-to-br from-brand-50/70 via-card-solid to-card-solid shadow-sm hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md",
      ].join(" ")}
    >
      <span
        className={[
          "absolute inset-y-0 left-0 w-1",
          seen ? "bg-brand-300/40" : "bg-brand-500",
        ].join(" ")}
        aria-hidden
      />
      <div className="flex items-center gap-4 px-5 py-4 md:gap-5 md:px-7 md:py-5">
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-sm">
          <BookOpen className="h-5 w-5" />
          {!seen && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-700">
            {seen ? "The briefing" : "Start here · read this first"}
          </div>
          <h2
            className="mt-0.5 text-[18px] font-semibold leading-tight tracking-tight text-fg md:text-[20px]"
            style={{ fontFamily: "var(--font-display-theme, inherit)" }}
          >
            What the job won&apos;t tell you
          </h2>
          <p className="mt-1 line-clamp-2 max-w-2xl text-[13px] leading-[1.6] text-fg-muted">
            The hidden power dynamics, the failure modes new hires fall into,
            and the questions that impress a hiring manager. Five minutes here
            changes how you read week 1.
          </p>
          {meta.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-subtle">
              {meta.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-fg-subtle/40" aria-hidden>
                      ·
                    </span>
                  )}
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>

        <span className="hidden shrink-0 items-center gap-1.5 self-center rounded-full border border-line bg-card-solid px-3.5 py-2 text-[12.5px] font-semibold text-fg transition group-hover:border-brand-400 group-hover:text-brand-700 sm:inline-flex">
          {seen ? "Reopen" : "Open"}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Week strip — 12 segments with current/completed/upcoming states
// ────────────────────────────────────────────────────────────────────

function WeekStrip({
  currentWeek,
  scenarios,
  log,
  onReviewWeek,
}: {
  currentWeek: number;
  scenarios: Scenario[];
  log: LogEntry[];
  onReviewWeek: (week: number) => void;
}) {
  // For each week 1..12, count its scenarios — affects segment opacity for
  // "scheduled" vs "empty" weeks.
  const weekDensity = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    for (const s of scenarios) {
      if (s.week >= 1 && s.week <= 12) counts[s.week - 1]++;
    }
    return counts;
  }, [scenarios]);

  const playedWeeks = useMemo(() => {
    const set = new Set<number>();
    for (const e of log) set.add(e.week);
    return set;
  }, [log]);

  const clampedWeek = Math.min(Math.max(currentWeek, 1), 12);
  const canGoBack = currentWeek > 1;

  return (
    <div className="rounded-[var(--radius-lg)] border border-line/70 bg-card-solid px-5 py-4 md:px-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-600" />
          <span className="text-[13px] font-semibold text-fg">
            Survive your first 12 weeks
          </span>
        </div>
        <span className="text-[12px] tabular-nums text-fg-subtle">
          Week <span className="font-semibold text-fg">{clampedWeek}</span> of 12
        </span>
      </div>
      <p className="mb-4 text-[11.5px] leading-snug text-fg-subtle">
        Each bar is one week. Make it to the{" "}
        <span className="text-fg-muted">week-12 review</span> with your standing
        intact — that&apos;s the whole job.
        {canGoBack && <> Tap a past week to look back or replay from there.</>}
      </p>

      <div className="relative flex items-stretch gap-1 pt-3">
        {Array.from({ length: 12 }, (_, i) => {
          const week = i + 1;
          const status =
            week < currentWeek
              ? "done"
              : week === currentWeek
                ? "current"
                : "future";
          const hasScenarios = weekDensity[i] > 0;
          const isFinish = week === 12;
          const canReview = week < currentWeek && playedWeeks.has(week);

          const content = (
            <>
              {isFinish && (
                <Flag className="absolute -top-3 left-1/2 h-3 w-3 -translate-x-1/2 text-brand-600" />
              )}
              <div
                className={[
                  "rounded-full transition-colors",
                  status === "current" ? "h-2" : "h-1.5",
                  status === "done" && "bg-brand-400",
                  status === "current" && "bg-brand-600",
                  status === "future" && hasScenarios && "bg-line-strong/60",
                  status === "future" && !hasScenarios && "bg-line/70",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <div
                className={[
                  "mt-1.5 text-center text-[10.5px] tabular-nums",
                  status === "current" && "font-semibold text-fg",
                  status === "done" && "text-fg-subtle",
                  status === "future" && "text-fg-subtle/60",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {week}
              </div>
            </>
          );

          return canReview ? (
            <button
              key={week}
              type="button"
              onClick={() => onReviewWeek(week)}
              title={`Week ${week} — tap to look back or replay`}
              className="group relative flex-1 cursor-pointer rounded-md transition hover:bg-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/70"
            >
              {content}
            </button>
          ) : (
            <div
              key={week}
              className="group relative flex-1"
              title={
                isFinish
                  ? "Week 12 — your first performance review (the finish line)"
                  : `Week ${week}${hasScenarios ? ` — ${weekDensity[i]} scenario${weekDensity[i] === 1 ? "" : "s"}` : ""}`
              }
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Week review modal — look back at a past week, then optionally rewind
// ────────────────────────────────────────────────────────────────────

function WeekReviewModal({
  payload,
  log,
  week,
  onClose,
  onRewind,
}: {
  payload: SimulationPayload;
  log: LogEntry[];
  week: number;
  onClose: () => void;
  onRewind: (week: number) => void;
}) {
  const entries = log.filter((e) => e.week === week);
  const statLabel = (k: string) => {
    const s = payload.stats.find((x) => x.key === k);
    return s?.short || s?.label || k;
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[3px] md:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Week ${week} review`}
      style={{ animation: "fade-in 180ms ease-out" }}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg border border-line-strong bg-card-solid shadow-modal-deep"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slide-up-in 240ms ease-out" }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line/60 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[12px] text-fg-subtle">
              <CalendarDays className="h-3.5 w-3.5" />
              Looking back · Week {week}
            </div>
            <h2
              className="text-[19px] font-semibold tracking-tight text-fg md:text-[21px]"
              style={{ fontFamily: "var(--font-display-theme, inherit)" }}
            >
              What happened in week {week}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-raised/40 hover:text-fg"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="space-y-4 px-6 py-6">
          {entries.length === 0 ? (
            <p className="text-[13.5px] text-fg-muted">
              No decisions were recorded for week {week}.
            </p>
          ) : (
            entries.map((e, i) => (
              <div
                key={i}
                className="rounded-md border border-line/70 bg-raised/15 px-4 py-3.5"
              >
                <div className="mb-2 text-[13.5px] font-semibold text-fg">
                  {e.scenarioTitle}
                </div>
                <div className="mb-1 text-[11px] text-fg-subtle">You chose</div>
                <p className="mb-2.5 text-[13.5px] leading-[1.55] text-fg">
                  {e.choiceLabel}
                </p>
                <div className="mb-1 text-[11px] text-fg-subtle">Outcome</div>
                <p className="text-[13px] leading-[1.6] text-fg-muted">
                  {e.outcome}
                </p>
                {Object.keys(e.effects ?? {}).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(e.effects).map(([k, v]) => (
                      <span
                        key={k}
                        className={[
                          "rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums",
                          (v ?? 0) >= 0
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-rose-50 text-rose-800",
                        ].join(" ")}
                      >
                        {(v ?? 0) >= 0 ? "+" : ""}
                        {v} {statLabel(k)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 bg-raised/20 px-6 py-4">
          <p className="max-w-[58%] text-[11.5px] leading-snug text-fg-subtle">
            {week <= 1
              ? "Rewinding restarts the whole quarter from week 1."
              : `Rewinding keeps weeks 1–${week - 1} and clears week ${week} onward.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-line bg-card-solid px-3.5 py-2 text-[12.5px] font-medium text-fg hover:border-line-strong"
            >
              Close
            </button>
            <button
              onClick={() => onRewind(week)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rewind &amp; replay from week {week}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Dashboard — 5 stats stacked vertically
// ────────────────────────────────────────────────────────────────────

function DashboardCard({
  payload,
  stats,
  hover,
  week,
}: {
  payload: SimulationPayload;
  stats: AttemptStats;
  hover: Record<string, number> | null;
  week: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
        <span className="text-[12.5px] font-medium text-fg">Dashboard</span>
        <span className="text-[11px] tabular-nums text-fg-subtle">
          Week {week}
        </span>
      </div>
      <div className="space-y-4 p-5">
        {payload.stats.map((s) => (
          <StatRow
            key={s.key}
            stat={s}
            value={stats[s.key] ?? s.initialValue}
            delta={hover?.[s.key]}
          />
        ))}
      </div>
      <p className="border-t border-line/50 px-5 py-2.5 text-[11px] leading-snug text-fg-subtle">
        Hover a choice to preview deltas. Changes apply on Continue.
      </p>
    </Card>
  );
}

function StatRow({
  stat,
  value,
  delta,
}: {
  stat: StatDef;
  value: number;
  delta: number | undefined;
}) {
  const Icon = STAT_ICONS[stat.key] ?? Sparkles;
  const projected =
    typeof delta === "number"
      ? Math.max(0, Math.min(100, value + delta))
      : value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-[12.5px] text-fg-muted">
          <Icon className="h-3.5 w-3.5 text-fg-subtle/80" />
          {stat.label}
        </span>
        <span className="tabular-nums text-[12.5px] text-fg">
          {value}
          {typeof delta === "number" && delta !== 0 && (
            <span
              className={[
                "ml-1.5 text-[11.5px]",
                delta > 0 ? "text-emerald-700/80" : "text-rose-700/80",
              ].join(" ")}
            >
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
        </span>
      </div>
      <div className="relative h-[5px] overflow-hidden rounded-full bg-line/70">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{
            width: `${value}%`,
            background: stat.color,
            opacity: 0.85,
          }}
        />
        {typeof delta === "number" && delta !== 0 && (
          <div
            className="absolute inset-y-0 rounded-full opacity-45 transition-[width] duration-500"
            style={{
              left: `${Math.min(value, projected)}%`,
              width: `${Math.abs(projected - value)}%`,
              background:
                delta > 0 ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Scenario card — the centerpiece
// ────────────────────────────────────────────────────────────────────

// Scenario-type labels are surfaced as chips on every scenario card.
// "VP 1:1" used to be the label for the manager-meeting scenario type
// but the simulator covers all role types now (an MSL meets a TA
// Head, a nurse meets a Director of Nursing, etc.). "Manager 1:1"
// works for every JD without losing recognisability — and the
// underlying type key (vp_1on1) stays unchanged for compatibility
// with every Simulation already in the database.
const SCENARIO_TYPE_LABEL: Record<string, string> = {
  vp_1on1: "Manager 1:1",
  team: "Team",
  cross_func: "Cross-Functional",
  escalation: "Escalation",
  hiring: "Hiring",
  planning: "Planning",
  personal: "Personal",
};

function ScenarioPanel({
  scenario,
  resolved,
  submitting,
  onChoose,
  onHoverChoice,
  onContinue,
}: {
  scenario: Scenario;
  resolved: { choiceIdx: number; label: string; outcome: string } | null;
  submitting: boolean;
  onChoose: (idx: number) => void;
  onHoverChoice: (effect: Record<string, number> | null) => void;
  onContinue: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between border-b border-line/60 px-6 py-3 md:px-7">
        <div className="flex items-center gap-2 text-[12px] text-fg-subtle">
          <span className="text-fg-muted">Week {scenario.week}</span>
          <span>·</span>
          <span>{SCENARIO_TYPE_LABEL[scenario.type] ?? scenario.type}</span>
        </div>
      </header>

      <div className="px-6 pt-8 md:px-8 md:pt-9">
        <h2
          className="mb-3.5 text-[26px] font-semibold leading-[1.2] tracking-tight text-fg md:text-[30px]"
          style={{ fontFamily: "var(--font-display-theme, inherit)" }}
        >
          {scenario.title}
        </h2>
        <p className="mb-6 text-[14.5px] leading-[1.65] text-fg-muted">
          {scenario.setting}
        </p>
      </div>

      <div className="mx-6 mb-6 border-l-2 border-line-strong/60 pl-5 md:mx-8 md:mb-7">
        <p
          className="text-[16px] leading-[1.6] text-fg md:text-[17px]"
          style={{ fontFamily: "var(--font-display-theme, inherit)" }}
        >
          {scenario.prompt}
        </p>
      </div>

      {!resolved && (
        <div className="space-y-2 px-6 pb-7 md:px-8 md:pb-8">
          <div className="mb-2 text-[12px] text-fg-subtle">
            Pick one — hover to preview the impact.
          </div>
          {scenario.choices.map((c, idx) => (
            <ChoiceButton
              key={idx}
              choice={c}
              letter={String.fromCharCode(65 + idx)}
              disabled={submitting}
              onSelect={() => onChoose(idx)}
              onHoverChange={(hovering) => onHoverChoice(hovering ? c.effects : null)}
            />
          ))}
        </div>
      )}

      {resolved && (
        <div className="space-y-4 px-6 pb-7 md:px-8 md:pb-8">
          <ChosenCard label={resolved.label} />
          <OutcomeCard outcome={resolved.outcome} />
          <button
            onClick={onContinue}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 px-5 py-3 text-[14px] font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Continue
                <span>→</span>
              </>
            )}
          </button>
        </div>
      )}
    </Card>
  );
}

function ChoiceButton({
  choice,
  letter,
  disabled,
  onSelect,
  onHoverChange,
}: {
  choice: { label: string; effects: Record<string, number> };
  letter: string;
  disabled: boolean;
  onSelect: () => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      className="group flex w-full items-start gap-3 rounded-md border border-line/70 bg-card-solid px-4 py-3.5 text-left text-[14px] leading-[1.55] text-fg transition hover:border-line-strong hover:bg-raised/30 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:opacity-50"
    >
      <span className="mt-[1px] shrink-0 text-[12.5px] text-fg-subtle group-hover:text-fg-muted">
        {letter}.
      </span>
      <span className="flex-1">{choice.label}</span>
    </button>
  );
}

function ChosenCard({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-line/70 bg-raised/30 px-4 py-3">
      <div className="mb-1 text-[11px] text-fg-subtle">You chose</div>
      <p className="text-[14px] leading-[1.55] text-fg">{label}</p>
    </div>
  );
}

function OutcomeCard({ outcome }: { outcome: string }) {
  return (
    <div className="rounded-md border border-line/70 bg-card-solid px-4 py-3.5">
      <div className="mb-1.5 text-[11px] text-fg-subtle">Outcome</div>
      <p className="text-[14px] leading-[1.65] text-fg">{outcome}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Roster — clickable list with anchored popup
// ────────────────────────────────────────────────────────────────────

function RosterPanel({ payload }: { payload: SimulationPayload }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const allPeople = [
    ...payload.team,
    ...payload.partners,
    ...(payload.kols ?? []),
  ];
  const selected = openId
    ? allPeople.find((p) => p.id === openId) ?? null
    : null;

  function handleOpen(id: string, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.top });
    setOpenId(id);
  }

  return (
    <>
      <Card className="overflow-hidden">
        <header className="flex items-center justify-between border-b border-line/60 px-5 py-3">
          <span className="text-[12.5px] font-medium text-fg">Roster</span>
          <span className="text-[11px] text-fg-subtle">Click a name</span>
        </header>
        <RosterGroup
          title="Your Team"
          subtitle={`${payload.team.length} reports`}
          people={payload.team}
          onOpen={handleOpen}
          activeId={openId}
        />
        <RosterGroup
          title="Cross-Functional"
          subtitle={`${payload.partners.length} partners`}
          people={payload.partners}
          onOpen={handleOpen}
          activeId={openId}
        />
        {payload.kols && payload.kols.length > 0 && (
          <RosterGroup
            title="Key Opinion Leaders"
            subtitle={`${payload.kols.length} external`}
            people={payload.kols}
            onOpen={handleOpen}
            activeId={openId}
            scrollable
          />
        )}
      </Card>
      {selected && anchor && (
        <PersonPopup
          person={selected}
          anchor={anchor}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function RosterGroup({
  title,
  subtitle,
  people,
  onOpen,
  activeId,
  scrollable,
}: {
  title: string;
  subtitle: string;
  people: Person[];
  onOpen: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  activeId: string | null;
  scrollable?: boolean;
}) {
  return (
    <div className="border-b border-line/40 last:border-b-0">
      <div className="flex items-baseline justify-between px-5 pb-1.5 pt-3">
        <span className="text-[11.5px] text-fg-subtle">{title}</span>
        <span className="text-[11px] text-fg-subtle/70">{subtitle}</span>
      </div>
      <ul className={scrollable ? "max-h-[360px] overflow-y-auto" : undefined}>
        {people.map((p) => (
          <li key={p.id}>
            <button
              onClick={(e) => onOpen(p.id, e)}
              className={[
                "group flex w-full items-center gap-3 px-5 py-2.5 text-left transition",
                activeId === p.id
                  ? "bg-raised/60"
                  : "hover:bg-raised/30",
              ].join(" ")}
            >
              <PersonAvatar
                id={p.id}
                name={p.name}
                size={32}
                active={activeId === p.id}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={[
                    "truncate text-[13px] leading-tight",
                    activeId === p.id ? "font-medium text-fg" : "text-fg",
                  ].join(" ")}
                >
                  {p.name}
                </div>
                <div className="truncate text-[11.5px] leading-tight text-fg-subtle">
                  {p.role}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Anchored popup
// ────────────────────────────────────────────────────────────────────

function PersonPopup({
  person,
  anchor,
  onClose,
}: {
  person: Person;
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{
    top: number;
    right: number;
    width: number;
    maxHeight: number;
    centered: boolean;
  } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const PAD = 16;
    const GAP = 12;
    const MAX_W = 480;
    const MAX_H = 600;
    if (vw < 900) {
      setPos({
        top: PAD,
        right: PAD,
        width: Math.min(vw - PAD * 2, MAX_W),
        maxHeight: vh - PAD * 2,
        centered: true,
      });
      return;
    }
    const width = Math.min(MAX_W, anchor.x - PAD - GAP);
    const right = vw - anchor.x + GAP;
    let top = anchor.y - 40;
    const maxHeight = Math.min(MAX_H, vh - PAD * 2);
    if (top + maxHeight > vh - PAD) {
      top = Math.max(PAD, vh - PAD - maxHeight);
    }
    if (top < PAD) top = PAD;
    setPos({ top, right, width, maxHeight, centered: false });
  }, [anchor]);

  if (!pos) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]"
      onClick={onClose}
      style={{ animation: "fade-in 180ms ease-out" }}
    >
      <div
        className="absolute flex flex-col overflow-hidden rounded-lg border border-line-strong bg-card-solid shadow-elevated-panel"
        onClick={(e) => e.stopPropagation()}
        style={
          pos.centered
            ? {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: pos.width,
                maxHeight: pos.maxHeight,
                animation: "slide-up-in 220ms ease-out",
              }
            : {
                top: pos.top,
                right: pos.right,
                width: pos.width,
                maxHeight: pos.maxHeight,
                animation: "slide-up-in 220ms ease-out",
              }
        }
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line bg-raised/40 px-5 py-4">
          <PersonAvatar id={person.id} name={person.name} size={52} active />
          <div className="min-w-0 flex-1">
            <div
              className="text-base font-semibold tracking-tight text-fg"
              style={{ fontFamily: "var(--font-display-theme, inherit)" }}
            >
              {person.name}
            </div>
            <div className="text-[12.5px] text-fg-muted">{person.role}</div>
            <div className="text-[10.5px] text-fg-subtle">{person.tenure}</div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-card-solid text-fg-muted hover:bg-raised hover:text-fg"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-line bg-raised/20 px-5 py-3">
            <p className="text-[12.5px] leading-relaxed text-fg-muted">
              {person.oneLiner}
            </p>
          </div>
          {person.playbook && <PlaybookBlock playbook={person.playbook} />}
          <div className="divide-y divide-line/60">
            <Rhythm label="Daily" items={person.daily} />
            <Rhythm label="Weekly" items={person.weekly} />
            <Rhythm label="Monthly" items={person.monthly} />
            <Rhythm label="Quarterly" items={person.quarterly} />
            <Rhythm label="Annually" items={person.annual} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-line bg-raised/30 px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
          Press ESC or click outside to close
        </footer>
      </div>
    </div>
  );
}

function Rhythm({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="px-5 py-3">
      <div className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-brand-700">
        {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-fg">
            <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-brand-500" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Per-person operating playbook — the substantive "how to work with
 * them" section. Renders above the daily/weekly rhythms so the
 * actionable guidance is the first thing the player reads.
 */
function PlaybookBlock({
  playbook,
}: {
  playbook: NonNullable<Person["playbook"]>;
}) {
  return (
    <div className="border-b border-line bg-brand-50/30 px-5 py-4 space-y-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-700">
        How to work with them
      </div>
      {playbook.howToWorkWith && (
        <p className="text-[12px] leading-relaxed text-fg">
          {playbook.howToWorkWith}
        </p>
      )}
      {playbook.theyHelpWith.length > 0 && (
        <PlaybookList
          label="They can help with"
          tone="positive"
          items={playbook.theyHelpWith}
        />
      )}
      {playbook.avoid.length > 0 && (
        <PlaybookList label="Avoid" tone="negative" items={playbook.avoid} />
      )}
      {playbook.quickWin && (
        <div className="rounded-md bg-emerald-50 ring-1 ring-inset ring-emerald-200 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-emerald-800">
            Quick win
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-emerald-900">
            {playbook.quickWin}
          </p>
        </div>
      )}
    </div>
  );
}

function PlaybookList({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "positive" | "negative";
  items: string[];
}) {
  const bulletColor = tone === "positive" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div>
      <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-fg-muted">
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-fg">
            <span
              className={`mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full ${bulletColor}`}
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Review screen
// ────────────────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  "Exceeds Expectations":
    "bg-card-solid text-emerald-800/90 border-emerald-200/60",
  "Strong Meets":
    "bg-card-solid text-emerald-800/90 border-emerald-200/60",
  "Meets Expectations":
    "bg-card-solid text-fg border-line-strong",
  "Below Expectations":
    "bg-card-solid text-rose-800/90 border-rose-200/60",
  "Concerns Raised":
    "bg-card-solid text-rose-800/90 border-rose-300/70",
};

function ReviewView({
  payload,
  state,
  attemptId,
  guest,
  onReset,
}: {
  payload: SimulationPayload;
  state: AttemptState;
  attemptId?: string;
  guest?: boolean;
  onReset: () => void;
}) {
  const review = useMemo(() => computeReview(payload, state), [payload, state]);
  const profile = useMemo(
    () => computeDecisionProfile(payload, state),
    [payload, state],
  );
  const animatedScore = useCountUp(review.score, 1200);
  const tierClass = TIER_COLOR[review.tier] ?? TIER_COLOR["Meets Expectations"];
  const [briefingOpen, setBriefingOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Score reveal — calm, no blobs, no gradient mesh */}
      <Card className="p-10 text-center md:p-12">
        <div className="mb-3 text-[12px] text-fg-subtle">
          Q1 Performance Review · {payload.jobTitle}
        </div>
        <div
          className="tabular-nums leading-none text-fg"
          style={{
            fontFamily: "var(--font-display-theme, inherit)",
            fontSize: "clamp(64px, 12vw, 112px)",
            fontWeight: 500,
          }}
        >
          {animatedScore}
        </div>
        <div className="mt-5 inline-block">
          <span
            className={[
              "inline-flex items-center rounded-full border px-4 py-1 text-[13px] font-medium",
              tierClass,
            ].join(" ")}
          >
            {review.tier}
          </span>
        </div>
        <p className="mx-auto mt-5 max-w-xl text-[14px] leading-[1.65] text-fg-muted">
          {review.tierBlurb}
        </p>
      </Card>

      {/* Stat narratives */}
      <Card className="overflow-hidden">
        <header className="border-b border-line/60 px-5 py-3">
          <span className="text-[12.5px] font-medium text-fg">
            Stat narratives
          </span>
        </header>
        <div className="grid gap-px bg-line/50 md:grid-cols-2">
          {review.perStat.map((s) => {
            const def = payload.stats.find((x) => x.key === s.key);
            const start = def?.initialValue ?? 50;
            const delta = s.value - start;
            const Icon = STAT_ICONS[s.key] ?? Sparkles;
            return (
              <div key={s.key} className="bg-card-solid p-5">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-[13.5px] text-fg">
                    <Icon className="h-3.5 w-3.5 text-fg-subtle" />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-fg-subtle text-[12px]">
                    {start}
                    <span className="mx-1">→</span>
                    <span className="text-[15px] text-fg">{s.value}</span>
                    <span
                      className={[
                        "ml-2 text-[11.5px]",
                        delta >= 0 ? "text-emerald-700/70" : "text-rose-700/70",
                      ].join(" ")}
                    >
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                  </span>
                </div>
                <p className="text-[12.5px] leading-[1.65] text-fg-muted">
                  {s.narrative}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {review.highlights.length > 0 && (
        <Card className="overflow-hidden">
          <header className="border-b border-line/60 px-5 py-3">
            <span className="text-[12.5px] font-medium text-fg">
              Highlights
            </span>
          </header>
          <ul className="space-y-2 px-5 py-4 text-[13.5px] text-fg">
            {review.highlights.map((h, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-fg-subtle/60" />
                <span className="leading-[1.6]">{h}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {review.lowlights.length > 0 && (
        <Card className="overflow-hidden">
          <header className="border-b border-line/60 px-5 py-3">
            <span className="text-[12.5px] font-medium text-fg">
              Areas to develop
            </span>
          </header>
          <ul className="space-y-2 px-5 py-4 text-[13.5px] text-fg">
            {review.lowlights.map((l, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-fg-subtle/60" />
                <span className="leading-[1.6]">{l}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* VP closing — calm quote, no accent background */}
      <Card>
        <div className="px-6 py-6 md:px-8 md:py-7">
          <div className="mb-3 text-[12px] text-fg-subtle">
            Closing — {payload.vpName}
          </div>
          <blockquote
            className="text-[17px] leading-[1.65] text-fg md:text-[18px]"
            style={{ fontFamily: "var(--font-display-theme, inherit)" }}
          >
            {review.vpClosing}
          </blockquote>
          <div className="mt-3 text-[12px] text-fg-subtle">
            {payload.vpRole}
          </div>
        </div>
      </Card>

      {/* Decision profile — playstyle analysis from the log */}
      <DecisionProfileCard profile={profile} />

      {/* Briefing recap — what the JD didn't tell you (if available) */}
      {payload.briefing && (
        <Card className="overflow-hidden">
          <header className="flex items-center justify-between border-b border-line/60 px-5 py-3">
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
              <BookOpen className="h-3.5 w-3.5 text-fg-subtle" />
              Briefing recap
            </span>
            <button
              onClick={() => setBriefingOpen(true)}
              className="text-[12px] text-fg-muted hover:text-fg"
            >
              Open full briefing →
            </button>
          </header>
          <div className="grid gap-px bg-line/50 md:grid-cols-2">
            <div className="bg-card-solid px-5 py-4">
              <div className="mb-1.5 text-[11.5px] text-fg-subtle">
                Hidden dynamics
              </div>
              <p className="line-clamp-4 text-[13px] leading-[1.65] text-fg-muted">
                {payload.briefing.hiddenDynamics}
              </p>
            </div>
            <div className="bg-card-solid px-5 py-4">
              <div className="mb-1.5 text-[11.5px] text-fg-subtle">
                Interview questions ({payload.briefing.interviewQuestions.length})
              </div>
              <p className="line-clamp-4 text-[13px] leading-[1.65] text-fg-muted">
                Surgical questions to ask the hiring manager — derived from the
                dynamics you just lived through.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <RotateCcw className="h-4 w-4" /> Try the quarter again
        </button>
        {guest ? (
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-line bg-card-solid px-5 py-2.5 text-sm font-medium text-fg hover:border-brand-400 hover:text-brand-700"
          >
            Explore the BHN Training Platform
          </a>
        ) : (
          <a
            href="/simulator"
            className="inline-flex items-center gap-2 rounded-md border border-line bg-card-solid px-5 py-2.5 text-sm font-medium text-fg hover:border-brand-400 hover:text-brand-700"
          >
            Back to my simulations
          </a>
        )}
      </div>

      <div className="pt-4 text-center text-[10px] font-mono uppercase tracking-[0.18em] text-fg-subtle">
        {guest
          ? `Shared preview · ${state.log.length} decisions logged`
          : `Attempt ${attemptId?.slice(0, 8) ?? "—"} · ${state.log.length} decisions logged`}
      </div>

      {briefingOpen && payload.briefing && (
        <BriefingModal payload={payload} onClose={() => setBriefingOpen(false)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Welcome modal — first-visit walkthrough
// ────────────────────────────────────────────────────────────────────

/**
 * Five-pane welcome modal shown on first render of an attempt. The
 * player can advance with the arrow buttons or jump straight to the
 * sim by clicking Start. localStorage-gated per attemptId so a
 * dismissal sticks across reloads.
 */
function WelcomeModal({
  payload,
  onClose,
  onOpenBriefing,
}: {
  payload: SimulationPayload;
  onClose: () => void;
  onOpenBriefing?: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = useMemo(
    () => [
      {
        title: `You're the new ${payload.jobTitle}`,
        body: `Reporting to ${payload.vpName}. The goal is simple: survive your first 12 weeks and reach the week-12 performance review with your standing intact. It's a simulation — real-shaped decisions, zero real-world risk — so make the move you'd hesitate to make at work, and watch how it lands.`,
      },
      {
        title: "Your first move: read the briefing",
        body: payload.briefing
          ? `Before you decide anything, open the “Start here” briefing card at the top of the board. It's what the job description won't tell you — who really holds power, the failure modes new hires fall into, and the questions that impress a hiring manager. Five minutes there will change how you read week 1.`
          : `Each scenario gives you 3–4 options. Hover one to preview how it moves your stats, then click to commit. The “safe” choice is rarely the best — most options carry a tempting-but-flawed catch.`,
      },
      {
        title: `Read the room: ${payload.stats.length} stats`,
        body: `Every decision shifts ${payload.stats.map((s) => s.label).join(", ")}. Hover a choice before you commit to preview the exact deltas. Your manager's trust and your team's output weigh the most at the quarter-end review.`,
      },
      {
        title: "Know your people",
        body: `You'll work with ${payload.team.length} teammates and ${payload.partners.length} cross-functional partners${
          payload.kols && payload.kols.length > 0
            ? `, plus a panel of ${payload.kols.length} external Key Opinion Leaders to win over`
            : ""
        }. Click any name in the roster to open their dossier — how to work with them, what they can unblock, what to avoid. Skim a few before week 1.`,
      },
      {
        title: "Make the call — it all saves",
        body: `Work through each week's scenarios; progress checkpoints after every choice, so you can step away and pick up later. At week 12, ${payload.vpName} writes your performance review — a tier plus a per-stat narrative. Reset and try a different path any time.`,
      },
    ],
    [payload],
  );

  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && !isLast) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && !isFirst) setStep((s) => s - 1);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, isFirst, isLast]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding guide"
    >
      <div
        className="relative w-full max-w-xl rounded-2xl border border-line bg-card-solid shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle hover:bg-elevated hover:text-fg"
          aria-label="Close welcome"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-7 pt-9 pb-3">
          <div className="mb-2.5 inline-flex items-center gap-2 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-800 ring-1 ring-inset ring-brand-200">
            <Sparkles className="h-3 w-3" />
            Onboarding guide · {step + 1} of {steps.length}
          </div>
          <h2
            className="mb-3 text-[22px] font-semibold leading-[1.2] tracking-tight text-fg"
            style={{ fontFamily: "var(--font-display-theme, inherit)" }}
          >
            {steps[step].title}
          </h2>
          <p className="text-[14px] leading-[1.7] text-fg-muted">
            {steps[step].body}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-4 pt-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-brand-600"
                  : i < step
                    ? "w-1.5 bg-brand-300"
                    : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-raised/20 px-6 py-3.5 rounded-b-2xl">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            className="text-[12.5px] font-medium text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            {isLast ? (
              onOpenBriefing ? (
                <>
                  <button
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3.5 py-2 text-[12.5px] font-semibold text-fg hover:border-line-strong"
                  >
                    Skip to week 1
                  </button>
                  <button
                    onClick={onOpenBriefing}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Read the briefing →
                  </button>
                </>
              ) : (
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
                >
                  Start week 1 →
                </button>
              )
            ) : (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
              >
                Next →
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Count from 0 → target over `duration` ms with ease-out. */
function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ────────────────────────────────────────────────────────────────────
// Briefing modal — what the JD doesn't tell you
// ────────────────────────────────────────────────────────────────────

function BriefingModal({
  payload,
  onClose,
}: {
  payload: SimulationPayload;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!payload.briefing) return null;
  const b = payload.briefing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[3px] md:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Job dynamics briefing"
      style={{ animation: "fade-in 180ms ease-out" }}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg border border-line-strong bg-card-solid shadow-elevated-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slide-up-in 240ms ease-out" }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line/60 px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-[12px] text-fg-subtle">
              <BookOpen className="h-3.5 w-3.5" />
              Briefing — {payload.jobTitle}
            </div>
            <h2
              className="text-[19px] font-semibold tracking-tight text-fg md:text-[21px]"
              style={{ fontFamily: "var(--font-display-theme, inherit)" }}
            >
              What the JD doesn&apos;t tell you
            </h2>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-fg-muted">
              Use this to sharpen interview prep, set realistic expectations,
              and recognise patterns inside the sim.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-raised/40 hover:text-fg"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="space-y-6 px-6 py-6">
          <section>
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
              <Compass className="h-3.5 w-3.5 text-fg-subtle" />
              Hidden dynamics
            </h3>
            <p className="rounded-md border-l-2 border-line-strong/60 bg-raised/20 px-4 py-3 text-[14px] leading-[1.7] text-fg">
              {b.hiddenDynamics}
            </p>
          </section>

          {b.failureModes.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[12.5px] font-medium text-fg">
                Common failure modes
              </h3>
              <ul className="space-y-1.5">
                {b.failureModes.map((f, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-md border border-line/60 bg-card-solid px-4 py-3 text-[13.5px] leading-[1.65] text-fg"
                  >
                    <span className="shrink-0 text-fg-subtle">{i + 1}.</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {b.unwrittenRules.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[12.5px] font-medium text-fg">
                Unwritten rules
              </h3>
              <ul className="space-y-1.5">
                {b.unwrittenRules.map((r, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-md border border-line/60 bg-card-solid px-4 py-3 text-[13.5px] leading-[1.65] text-fg"
                  >
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-fg-subtle/60" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {b.interviewQuestions.length > 0 && (
            <section>
              <h3 className="mb-2.5 text-[12.5px] font-medium text-fg">
                Questions to ask the hiring manager
              </h3>
              <ol className="space-y-1.5">
                {b.interviewQuestions.map((q, i) => (
                  <li
                    key={i}
                    className="flex gap-3 rounded-md border border-line/60 bg-card-solid px-4 py-3 text-[13.5px] leading-[1.65] text-fg"
                  >
                    <span className="shrink-0 text-fg-subtle">{i + 1}.</span>
                    <span
                      style={{
                        fontFamily: "var(--font-display-theme, inherit)",
                      }}
                    >
                      {q}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[12px] text-fg-subtle">
                Tip: keep these on hand when the manager asks &ldquo;do you have
                any questions for us?&rdquo;
              </p>
            </section>
          )}
        </div>

        <footer className="border-t border-line/60 px-5 py-2.5 text-center text-[11px] text-fg-subtle">
          Press ESC or click outside to close
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Decision profile — surfaces playstyle patterns from the log
// ────────────────────────────────────────────────────────────────────

const ARCHETYPE_TONE: Record<string, { bg: string; text: string; border: string }> = {
  collaborative: {
    bg: "bg-card-solid",
    text: "text-fg",
    border: "border-line-strong",
  },
  decisive: {
    bg: "bg-card-solid",
    text: "text-fg",
    border: "border-line-strong",
  },
  conservative: {
    bg: "bg-card-solid",
    text: "text-fg",
    border: "border-line-strong",
  },
  bold: {
    bg: "bg-card-solid",
    text: "text-fg",
    border: "border-line-strong",
  },
  balanced: {
    bg: "bg-card-solid",
    text: "text-fg",
    border: "border-line-strong",
  },
};

function DecisionProfileCard({
  profile,
}: {
  profile: import("@/lib/simulator/engine").DecisionProfile;
}) {
  if (profile.decisionCount === 0) return null;
  const tone = ARCHETYPE_TONE[profile.archetype] ?? ARCHETYPE_TONE.balanced;
  return (
    <Card className="overflow-hidden">
      <header className="border-b border-line/60 px-5 py-3">
        <span className="text-[12.5px] font-medium text-fg">
          Your decision profile
        </span>
      </header>

      <div className="grid gap-px bg-line/50 md:grid-cols-[1fr_1fr]">
        <div className="bg-card-solid p-5">
          <div className="mb-2 text-[11.5px] text-fg-subtle">Archetype</div>
          <div className="mb-3 inline-flex">
            <span
              className={`rounded-full border ${tone.border} ${tone.bg} ${tone.text} px-3 py-1 text-[12.5px] capitalize`}
            >
              {profile.archetype}
            </span>
          </div>
          <p className="text-[13px] leading-[1.65] text-fg-muted">
            {profile.archetypeBlurb}
          </p>
        </div>

        <div className="bg-card-solid p-5">
          <div className="mb-3 text-[11.5px] text-fg-subtle">
            Stat fingerprint
          </div>
          <dl className="space-y-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Most protected</dt>
              <dd className="text-right">
                <span className="text-fg">{profile.protectedLabel}</span>
                <span className="ml-2 tabular-nums text-[12px] text-emerald-700/80">
                  {profile.protectedNet >= 0
                    ? `+${profile.protectedNet}`
                    : profile.protectedNet}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Most sacrificed</dt>
              <dd className="text-right">
                <span className="text-fg">{profile.sacrificedLabel}</span>
                <span className="ml-2 tabular-nums text-[12px] text-rose-700/80">
                  {profile.sacrificedNet}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Intensity per decision</dt>
              <dd className="tabular-nums text-[12px] text-fg">
                {profile.avgIntensity.toFixed(1)} pts
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">Decisions made</dt>
              <dd className="tabular-nums text-[12px] text-fg">
                {profile.decisionCount}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {profile.patternCallouts.length > 0 && (
        <div className="border-t border-line/60 px-5 py-4">
          <div className="mb-2 text-[11.5px] text-fg-subtle">
            Patterns worth reflecting on
          </div>
          <ul className="space-y-2">
            {profile.patternCallouts.map((c, i) => (
              <li
                key={i}
                className="flex gap-2 text-[13px] leading-[1.65] text-fg"
              >
                <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-fg-subtle/60" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
