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
  Battery,
  BookOpen,
  Compass,
  Loader2,
  Network,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { computeDecisionProfile, computeReview } from "@/lib/simulator/engine";
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
  attemptId: string;
  payload: SimulationPayload;
  initialState: AttemptState;
};

const STAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  morale: Users,
  vpTrust: TrendingUp,
  velocity: Activity,
  crossFunc: Network,
  capacity: Battery,
};

export function SimulatorPlayer({ attemptId, payload, initialState }: Props) {
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
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `sim:welcome:${attemptId}`;
    if (!localStorage.getItem(key)) setWelcomeOpen(true);
  }, [attemptId]);
  function dismissWelcome() {
    setWelcomeOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(`sim:welcome:${attemptId}`, "dismissed");
    }
  }
  const router = useRouter();

  const scenarios = payload.scenarios.filter((s) => s.week === state.week);
  const scenario: Scenario | undefined = scenarios[state.scenarioIndex];
  const pendingNextRef = useRef<AttemptState | null>(null);

  async function makeChoice(idx: number) {
    if (!scenario || submitting) return;
    setSubmitting(true);
    setError(null);
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
    const res = await fetch(`/api/simulator/${attemptId}/reset`, {
      method: "POST",
    });
    if (res.ok) {
      // Reset local state without round-tripping through Prisma — we
      // know the initial state from the payload.
      const stats: AttemptStats = {};
      for (const s of payload.stats) stats[s.key] = s.initialValue;
      setState({ week: 1, scenarioIndex: 0, stats, log: [], finished: false });
      setResolved(null);
      pendingNextRef.current = null;
      router.refresh();
    }
  }

  // Review view when finished
  if (state.finished) {
    return (
      <ReviewView
        payload={payload}
        state={state}
        attemptId={attemptId}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero band — role context */}
      <RoleHeader
        payload={payload}
        onReset={handleReset}
        onOpenBriefing={
          payload.briefing ? () => setBriefingOpen(true) : undefined
        }
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
                  setBriefingOpen(true);
                }
              : undefined
          }
        />
      )}

      {/* Week progress strip */}
      <WeekStrip currentWeek={state.week} scenarios={payload.scenarios} />

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
  onOpenBriefing,
}: {
  payload: SimulationPayload;
  onReset: () => void;
  onOpenBriefing?: () => void;
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
          {onOpenBriefing && (
            <button
              onClick={onOpenBriefing}
              className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-[14px] font-semibold text-white shadow-md transition hover:bg-brand-700 hover:shadow-lg active:scale-[0.98]"
            >
              <BookOpen className="h-4 w-4" />
              Read the briefing
              <span className="ml-1 hidden text-[11px] font-normal text-white/75 sm:inline">
                · hidden dynamics, failure modes, interview Qs
              </span>
            </button>
          )}
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
// Week strip — 12 segments with current/completed/upcoming states
// ────────────────────────────────────────────────────────────────────

function WeekStrip({
  currentWeek,
  scenarios,
}: {
  currentWeek: number;
  scenarios: Scenario[];
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

  return (
    <div className="flex items-stretch gap-1 px-1">
      {Array.from({ length: 12 }, (_, i) => {
        const week = i + 1;
        const state =
          week < currentWeek
            ? "done"
            : week === currentWeek
              ? "current"
              : "future";
        const hasScenarios = weekDensity[i] > 0;
        return (
          <div
            key={week}
            className="group relative flex-1"
            title={`Week ${week}${hasScenarios ? ` — ${weekDensity[i]} scenario${weekDensity[i] === 1 ? "" : "s"}` : ""}`}
          >
            <div
              className={[
                "h-1 rounded-full transition-colors",
                state === "done" && "bg-brand-400",
                state === "current" && "bg-brand-600",
                state === "future" && hasScenarios && "bg-line-strong/60",
                state === "future" && !hasScenarios && "bg-line/70",
              ]
                .filter(Boolean)
                .join(" ")}
            />
            <div
              className={[
                "mt-1.5 text-center text-[10.5px] tabular-nums",
                state === "current" && "font-semibold text-fg",
                state === "done" && "text-fg-subtle",
                state === "future" && "text-fg-subtle/60",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {week}
            </div>
          </div>
        );
      })}
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
  const allPeople = [...payload.team, ...payload.partners];
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
}: {
  title: string;
  subtitle: string;
  people: Person[];
  onOpen: (id: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  activeId: string | null;
}) {
  return (
    <div className="border-b border-line/40 last:border-b-0">
      <div className="flex items-baseline justify-between px-5 pb-1.5 pt-3">
        <span className="text-[11.5px] text-fg-subtle">{title}</span>
        <span className="text-[11px] text-fg-subtle/70">{subtitle}</span>
      </div>
      <ul>
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
  onReset,
}: {
  payload: SimulationPayload;
  state: AttemptState;
  attemptId: string;
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
        <a
          href="/simulator"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-card-solid px-5 py-2.5 text-sm font-medium text-fg hover:border-brand-400 hover:text-brand-700"
        >
          Back to my simulations
        </a>
      </div>

      <div className="pt-4 text-center text-[10px] font-mono uppercase tracking-[0.18em] text-fg-subtle">
        Attempt {attemptId.slice(0, 8)} · {state.log.length} decisions logged
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
        title: `Welcome to your ${payload.jobTitle} quarter`,
        body: `You're the new ${payload.jobTitle.toLowerCase()} reporting to ${payload.vpName}. The next 12 weeks are a simulation — real-shaped decisions, no real consequences. Try the thing you'd be afraid to try at work.`,
      },
      {
        title: "Five stats track how you're doing",
        body: `Each decision moves ${payload.stats.length} stats (${payload.stats.map((s) => s.label).join(", ")}). Hover any choice before committing to see exactly how it'll move them. Your manager's trust and your scientific craft carry the most weight at the QBR.`,
      },
      {
        title: "The roster is your safety net",
        body: `You'll meet ${payload.team.length} teammates and ${payload.partners.length} cross-functional partners. Click any name to open their dossier — daily/weekly rhythm, how to work with them, what they can help unblock, what to avoid. Read the first three before you start week 1.`,
      },
      {
        title: "Read the briefing before you decide",
        body: payload.briefing
          ? "The Briefing button (top-right) holds what the JD doesn't tell you: hidden power dynamics, failure modes new hires fall into, and the sharp questions to ask the hiring manager. Open it now — it'll change how you read week 1."
          : "Each scenario has 3–4 choices. Hover one to preview the stat-effects chips, click to commit. Most options have a tempting-but-flawed flavour. The 'safe' answer is rarely the best one.",
      },
      {
        title: "Twelve weeks. State auto-saves.",
        body: `After each choice the state checkpoints — close the tab and come back later. At week 12 the person you report to (${payload.vpName}) writes you a performance review with a tier and a per-stat narrative. You can reset and try a different path any time.`,
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
      aria-label="Welcome to the simulator"
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
            Quick tour · {step + 1} of {steps.length}
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
            {isLast && onOpenBriefing && (
              <button
                onClick={onOpenBriefing}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3.5 py-2 text-[12.5px] font-semibold text-fg hover:border-line-strong"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Open briefing
              </button>
            )}
            {isLast ? (
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700"
              >
                Start week 1 →
              </button>
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
