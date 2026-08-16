"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sparkles, X, Minimize2, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { TOUR_STEPS, TOUR_VERSION, type StepRole, type TourStep } from "@/lib/onboarding/tours";
import { cn } from "@/lib/utils";

interface State {
  version: string;
  seenStepIds: string[];
  minimized: boolean;
  dismissed: boolean;
  completedAt: string | null;
  currentVersion?: string;
}

const DEFAULT_STATE: State = {
  version: "",
  seenStepIds: [],
  minimized: false,
  dismissed: false,
  completedAt: null,
};

/**
 * Onboarding root. Mounted once at the dashboard layout — never on the
 * marketing pages. Handles fetch + persist + tooltip rendering.
 */
export function Onboarding() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const role = ((session?.user as { role?: string })?.role ?? "trainee") as StepRole;

  // ── Filter steps for this user ────────────────────────────────────
  const eligibleSteps = useMemo(() => {
    return TOUR_STEPS.filter((s) => !s.roles || s.roles.includes(role));
  }, [role]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const j = (await res.json()) as State;
        setState(j);
      } else {
        setState(DEFAULT_STATE);
      }
    } catch {
      setState(DEFAULT_STATE);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchState();
  }, [status, fetchState]);

  // Persist helpers
  const persist = useCallback(async (patch: Partial<State>) => {
    setState((cur) => (cur ? { ...cur, ...patch } : cur));
    try {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {}
  }, []);

  // ── Determine the next un-seen step ───────────────────────────────
  const nextStepIdx = useMemo(() => {
    if (!state) return null;
    const seen = new Set(state.seenStepIds);
    return eligibleSteps.findIndex((s) => !seen.has(s.id));
  }, [eligibleSteps, state]);

  // Auto-start if eligible and not dismissed.
  //
  // Never on the demo deployment: persona accounts reset nightly, so the
  // walkthrough would ambush every visitor on every entry ("Step 1 of
  // 100" over the first screen they came to see). The sidebar's "Take
  // the tour" entry still works there — it fires bhn:start-tour, which
  // bypasses this effect entirely.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return;
    if (!state) return;
    if (state.dismissed || state.completedAt) return;
    if (state.minimized) return;
    if (activeIdx !== null) return;
    if (nextStepIdx == null || nextStepIdx < 0) return;
    setActiveIdx(nextStepIdx);
  }, [state, activeIdx, nextStepIdx]);

  const step: TourStep | null = activeIdx != null ? eligibleSteps[activeIdx] ?? null : null;

  // ── Position anchor when step changes / pathname changes / scroll ─
  useEffect(() => {
    if (!step?.selector) {
      setAnchorRect(null);
      return;
    }
    function update() {
      const el = document.querySelector(step!.selector!) as HTMLElement | null;
      setAnchorRect(el?.getBoundingClientRect() ?? null);
    }
    update();
    const t = setTimeout(update, 100); // give layout a moment
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step, pathname]);

  // ── Esc key minimizes ────────────────────────────────────────────
  useEffect(() => {
    if (!step) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") minimize();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function markSeen(id: string) {
    if (!state) return;
    if (state.seenStepIds.includes(id)) return;
    persist({ seenStepIds: [...state.seenStepIds, id], version: TOUR_VERSION });
  }

  function next() {
    if (!step || activeIdx == null) return;
    markSeen(step.id);
    const nextIdx = activeIdx + 1;
    if (nextIdx >= eligibleSteps.length) {
      complete();
    } else {
      setActiveIdx(nextIdx);
    }
  }

  function back() {
    if (activeIdx == null || activeIdx === 0) return;
    setActiveIdx(activeIdx - 1);
  }

  function complete() {
    persist({
      completedAt: new Date().toISOString(),
      seenStepIds: eligibleSteps.map((s) => s.id),
      minimized: false,
      version: TOUR_VERSION,
    });
    setActiveIdx(null);
  }

  function dismiss() {
    persist({ dismissed: true, minimized: false });
    setActiveIdx(null);
  }

  function minimize() {
    persist({ minimized: true });
    setActiveIdx(null);
  }

  function resume() {
    persist({ minimized: false, dismissed: false });
    setState((cur) => (cur ? { ...cur, dismissed: false, minimized: false } : cur));
    if (nextStepIdx != null && nextStepIdx >= 0) setActiveIdx(nextStepIdx);
    else setActiveIdx(0);
  }

  function relaunch() {
    persist({ dismissed: false, minimized: false, seenStepIds: [], completedAt: null });
    setActiveIdx(0);
  }

  // External relaunch trigger. Any client component can fire
  //   window.dispatchEvent(new CustomEvent("bhn:start-tour"))
  // to restart the onboarding tour — used by the sidebar's
  // "Take the tour" menu entry so users have a discoverable
  // entry point besides the floating ? button.
  useEffect(() => {
    if (status !== "authenticated") return;
    const handler = () => relaunch();
    window.addEventListener("bhn:start-tour", handler);
    return () => window.removeEventListener("bhn:start-tour", handler);
    // relaunch is stable enough — using state-effect deps would over-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ── Renders ──────────────────────────────────────────────────────
  if (status !== "authenticated" || !state) return null;

  // The bottom-left "?" tour-restart button was removed on user
  // feedback — the relaunch helper still exists for the minimised
  // chip ("Resume tour"), and admins can always replay the tour via
  // Administration → Platform → System status. Skipping the floater
  // here keeps the lower-left corner clear of stray UI.

  // Minimized chip
  if (state.minimized && !step) {
    return (
      <MinimizedChip onResume={resume} onDismiss={dismiss} stepCount={eligibleSteps.length - state.seenStepIds.length} />
    );
  }

  if (!step) return null;

  // If the step has a path and we're not on it, show centered card with navigate CTA
  const onCorrectPath = !step.path || pathname === step.path || pathname.startsWith(step.path + "/");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px] animate-fade-in"
        onClick={minimize}
        aria-hidden
      />

      {/* Spotlight ring around anchor */}
      {onCorrectPath && step.selector && anchorRect && (
        <div
          // eslint-disable-next-line no-restricted-syntax -- the 9999px shadow is a viewport-darkening mask trick, not a real shadow — backdrop must be a fixed slate at the same opacity across themes.
          className="fixed z-40 pointer-events-none rounded-xl ring-4 ring-brand-400/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.5)] animate-fade-in"
          style={{
            top: anchorRect.top - 6,
            left: anchorRect.left - 6,
            width: anchorRect.width + 12,
            height: anchorRect.height + 12,
          }}
        />
      )}

      {/* Tooltip / centered card */}
      {onCorrectPath && step.selector && anchorRect ? (
        <Tooltip
          rect={anchorRect}
          placement={step.placement ?? "bottom"}
          step={step}
          stepIdx={activeIdx ?? 0}
          total={eligibleSteps.length}
          onNext={next}
          onBack={back}
          onMinimize={minimize}
          onDismiss={dismiss}
          onCta={(href) => router.push(href)}
        />
      ) : (
        <CenteredCard
          step={step}
          stepIdx={activeIdx ?? 0}
          total={eligibleSteps.length}
          onNext={next}
          onBack={back}
          onMinimize={minimize}
          onDismiss={dismiss}
          onCta={(href) => router.push(href)}
          showNavHint={!onCorrectPath}
        />
      )}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function MinimizedChip({ onResume, onDismiss, stepCount }: { onResume: () => void; onDismiss: () => void; stepCount: number }) {
  return (
    <button
      onClick={onResume}
      className="fixed bottom-4 right-4 z-30 flex items-center gap-2 bg-card border border-line rounded-full pl-2 pr-3 py-2 shadow-lg shadow-brand-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all group"
      title="Resume tour"
    >
      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-sm">
        <Sparkles size={13} />
      </span>
      <span className="text-xs font-medium text-fg">Resume tour</span>
      {stepCount > 0 && (
        <span className="text-[10px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-semibold">
          {stepCount}
        </span>
      )}
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="text-subtle hover:text-rose-600 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Dismiss tour"
      >
        <X size={12} />
      </span>
    </button>
  );
}

interface CardProps {
  step: TourStep;
  stepIdx: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onMinimize: () => void;
  onDismiss: () => void;
  onCta: (href: string) => void;
  showNavHint?: boolean;
}

function CardBody({ step, stepIdx, total, onNext, onBack, onMinimize, onDismiss, onCta, showNavHint }: CardProps) {
  const isLast = stepIdx === total - 1;
  return (
    <div className="bg-card rounded-2xl shadow-2xl shadow-brand-900/15 border border-line p-5 max-w-sm w-full animate-slide-up-in">
      <div className="flex items-start gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-sm shrink-0">
          <Sparkles size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-subtle uppercase tracking-[0.16em]">
            Step {stepIdx + 1} of {total}
          </p>
          <h3 className="font-semibold text-fg leading-snug">{step.title}</h3>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onMinimize}
            className="p-1.5 text-subtle hover:text-fg hover:bg-elevated rounded-md transition-colors"
            aria-label="Minimize"
            title="Minimize (Esc)"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 text-subtle hover:text-rose-600 hover:bg-elevated rounded-md transition-colors"
            aria-label="Skip tour"
            title="Skip tour"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{step.body}</p>

      {step.cta && showNavHint && (
        <button
          onClick={() => onCta(step.cta!.href)}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm py-2 px-4 rounded-lg"
        >
          {step.cta.label} <ArrowRight size={14} />
        </button>
      )}

      {/* Progress bar */}
      <div className="mt-4 h-1 bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all"
          style={{ width: `${((stepIdx + 1) / total) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={onBack}
          disabled={stepIdx === 0}
          className="text-xs text-muted hover:text-fg disabled:opacity-40 inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Back
        </button>
        <button
          onClick={onNext}
          className="bg-brand-600 hover:bg-brand-700 text-white font-medium text-sm px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
        >
          {isLast ? <><Check size={14} /> Finish</> : <>Next <ArrowRight size={14} /></>}
        </button>
      </div>
    </div>
  );
}

function CenteredCard(props: CardProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto">
        <CardBody {...props} />
      </div>
    </div>
  );
}

interface TooltipProps extends CardProps {
  rect: DOMRect;
  placement: "top" | "right" | "bottom" | "left" | "center";
}

function Tooltip(props: TooltipProps) {
  const { rect, placement } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const r = ref.current;
    if (!r) return;
    const w = r.offsetWidth;
    const h = r.offsetHeight;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = 0; let left = 0;
    switch (placement) {
      case "top":    top = rect.top - h - margin; left = rect.left + rect.width / 2 - w / 2; break;
      case "right":  top = rect.top + rect.height / 2 - h / 2; left = rect.right + margin;     break;
      case "left":   top = rect.top + rect.height / 2 - h / 2; left = rect.left - w - margin;  break;
      case "bottom":
      default:       top = rect.bottom + margin; left = rect.left + rect.width / 2 - w / 2;    break;
    }
    // Clamp into viewport
    top  = Math.max(8, Math.min(top, vh - h - 8));
    left = Math.max(8, Math.min(left, vw - w - 8));
    setPos({ top, left });
  }, [rect, placement]);

  if (placement === "center") return <CenteredCard {...props} />;

  return (
    <div
      ref={ref}
      className="fixed z-50 max-w-sm w-full"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? 1 : 0 }}
    >
      <CardBody {...props} />
    </div>
  );
}
