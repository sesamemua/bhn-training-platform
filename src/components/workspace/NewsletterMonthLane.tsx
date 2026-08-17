"use client";

/**
 * One month of the newsletter calendar, drawn as a real calendar strip
 * with the production window laid across it like a Gantt bar.
 *
 * Why a strip and not a month grid: every month has exactly one issue, so
 * a 5×7 grid would be ~26 empty cells around one short run of work. A
 * single row of the month's days keeps real dates in real positions —
 * still a calendar — while giving the window a continuous horizontal
 * extent you can actually grab. Every month uses the same 31 columns, so
 * the lanes line up down the page and "always the third week" becomes
 * visible rather than something you have to be told.
 *
 * Three gestures, one meaning each:
 *   • drag the band            → move the whole issue (send date moves,
 *                                everything re-derives backwards)
 *   • drag its left edge       → more or fewer writing days
 *   • drag the inner divider   → more or fewer build/review days
 *
 * The send date snaps to Tuesday/Wednesday/Thursday. Dragging across a
 * Friday simply will not land there, which teaches the rule by feel
 * instead of by paragraph.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  businessDaysBetween,
  daysOfMonth,
  isBusinessDay,
  planFromSendDate,
  snapToSendDay,
  stepSendDay,
  weekdayOf,
  type PlannedCycle,
} from "@/lib/newsletter/schedule";

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];

export interface LaneCycle {
  id: string;
  month: string;
  draftOpen: string;
  draftDue: string;
  buildStart: string;
  approvalDue: string;
  sendDate: string;
  status: string;
}

type DragKind = "move" | "draftEdge" | "buildEdge";

interface DragState {
  kind: DragKind;
  startX: number;
  cellWidth: number;
  origin: LaneCycle;
}

/** Dates a lane is currently showing — real ones, or a drag preview. */
type Shown = Pick<LaneCycle, "draftOpen" | "draftDue" | "buildStart" | "approvalDue" | "sendDate">;

export function NewsletterMonthLane({
  cycle,
  today,
  holidays,
  draggable,
  onCommit,
  children,
}: {
  cycle: LaneCycle;
  today: string;
  holidays: string[];
  draggable: boolean;
  onCommit: (patch: { sendDate?: string; draftDays?: number; buildDays?: number }) => void;
  children?: React.ReactNode;
}) {
  const [y, m] = cycle.month.split("-").map(Number);
  const days = useMemo(() => daysOfMonth(y, m), [y, m]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Shown | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);

  const shown: Shown = preview ?? cycle;
  const frozen = cycle.status === "approved" || cycle.status === "sent";
  const canDrag = draggable && !frozen;

  const colOf = useCallback(
    (iso: string) => {
      const i = days.indexOf(iso);
      // A window can start in the previous month when the send date is
      // early. Clamp to the left edge and let the caller mark it.
      return i === -1 ? (iso < days[0] ? 0 : days.length - 1) : i;
    },
    [days],
  );

  const startsEarlier = shown.draftOpen < days[0];

  // ── drag ──────────────────────────────────────────────────────────
  const beginDrag = (kind: DragKind) => (e: React.PointerEvent) => {
    if (!canDrag) return;
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind, startX: e.clientX, cellWidth: rect.width / 31, origin: cycle });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const deltaDays = Math.round((e.clientX - drag.startX) / drag.cellWidth);
    setPreview(computePreview(drag, deltaDays, holidays));
  };

  const endDrag = () => {
    if (!drag) return;
    const next = preview;
    setDrag(null);
    setPreview(null);
    if (!next) return;
    if (drag.kind === "move") {
      if (next.sendDate !== cycle.sendDate) onCommit({ sendDate: next.sendDate });
    } else if (drag.kind === "draftEdge") {
      const draftDays = businessDaysBetween(next.draftOpen, next.draftDue, holidays);
      if (draftDays >= 1) onCommit({ draftDays });
    } else {
      const buildDays = businessDaysBetween(next.buildStart, next.approvalDue, holidays);
      if (buildDays >= 1) onCommit({ buildDays });
    }
  };

  // Esc abandons a drag in flight — the standard escape hatch, and the
  // only way out once the pointer is captured.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrag(null);
        setPreview(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  /** Keyboard equivalent of the drag, so this is not pointer-only. */
  const onBandKey = (e: React.KeyboardEvent) => {
    if (!canDrag) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    if (e.shiftKey) {
      const current = businessDaysBetween(cycle.draftOpen, cycle.draftDue, holidays);
      onCommit({ draftDays: Math.max(1, Math.min(10, current + step)) });
    } else {
      onCommit({ sendDate: stepSendDay(cycle.sendDate, step as 1 | -1, holidays) });
    }
  };

  // ── geometry ──────────────────────────────────────────────────────
  const startCol = colOf(shown.draftOpen);
  const endCol = colOf(shown.sendDate);
  const span = Math.max(1, endCol - startCol + 1);
  // Where the build window begins, as a percentage across the band —
  // drives the gradient's turn and the divider handle.
  const buildPct = ((colOf(shown.buildStart) - startCol) / span) * 100;
  const sendPct = ((endCol - startCol) / span) * 100;

  const dragging = drag !== null;

  return (
    <section
      data-state={cycle.status}
      className="group/lane relative py-5"
      aria-label={`${monthName(y, m)} newsletter`}
    >
      {/* month + status, no badge — weight and colour carry it */}
      <div className="flex items-baseline gap-3 pb-2.5">
        <h3
          className={`text-[15px] tracking-tight ${
            frozen ? "font-semibold text-muted" : "font-bold text-fg"
          }`}
        >
          {monthName(y, m)}
        </h3>
        <StatusLine cycle={cycle} today={today} />
      </div>

      {/* ── the strip ─────────────────────────────────────────────── */}
      <div className="relative">
        {/* weekday initials — the thing that makes it read as a calendar */}
        <div
          className="grid select-none text-[9px] leading-none text-subtle"
          style={{ gridTemplateColumns: "repeat(31, minmax(0,1fr))" }}
          aria-hidden
        >
          {days.map((d) => (
            <span key={d} className="text-center">
              {WEEKDAY_INITIAL[weekdayOf(d)]}
            </span>
          ))}
        </div>

        <div
          ref={laneRef}
          className="relative mt-1 grid h-9 touch-none"
          style={{ gridTemplateColumns: "repeat(31, minmax(0,1fr))" }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* non-working days recede — a dip in the ground, not a box */}
          {days.map((d, i) => {
            const off = !isBusinessDay(d, holidays);
            const isToday = d === today;
            return (
              <div
                key={d}
                className="relative"
                style={{ gridColumn: `${i + 1} / span 1` }}
              >
                {off && <span className="absolute inset-0 bg-fg/[0.045]" aria-hidden />}
                {isToday && (
                  <span
                    className="absolute inset-y-[-6px] left-1/2 w-px -translate-x-1/2 bg-brand-400/70"
                    aria-hidden
                  />
                )}
              </div>
            );
          })}

          {/* the third week, washed in behind everything */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0"
            style={{
              gridColumn: "15 / span 7",
              left: 0,
              right: 0,
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-400) 7%, transparent) 20%, color-mix(in srgb, var(--brand-400) 7%, transparent) 80%, transparent)",
            }}
          />

          {/* ── the band ───────────────────────────────────────── */}
          <div
            role={canDrag ? "slider" : undefined}
            tabIndex={canDrag ? 0 : -1}
            aria-label={
              canDrag
                ? `${monthName(y, m)} issue — sends ${longDay(shown.sendDate)}. Arrow keys move the send date; shift plus arrows change the writing window.`
                : undefined
            }
            aria-valuetext={canDrag ? longDay(shown.sendDate) : undefined}
            onKeyDown={onBandKey}
            onPointerDown={beginDrag("move")}
            className={`relative z-10 self-center rounded-[var(--radius-sm,4px)] outline-none transition-[box-shadow,filter] focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
              canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default"
            } ${dragging ? "cursor-grabbing brightness-110" : ""}`}
            style={{
              gridColumn: `${startCol + 1} / span ${span}`,
              height: 18,
              opacity: frozen ? 0.5 : 1,
              background: `linear-gradient(90deg,
                color-mix(in srgb, var(--brand-700) 55%, transparent) 0%,
                color-mix(in srgb, var(--brand-600) 62%, transparent) ${Math.max(0, buildPct - 2)}%,
                color-mix(in srgb, var(--brand-500) 88%, transparent) ${Math.min(100, sendPct)}%,
                var(--brand-400) 100%)`,
              boxShadow: dragging
                ? "0 0 0 1px color-mix(in srgb, var(--brand-300) 70%, transparent)"
                : undefined,
            }}
          >
            {startsEarlier && (
              <span
                aria-hidden
                className="absolute -left-1 top-1/2 -translate-y-1/2 text-[9px] text-brand-200"
                title="Writing starts in the previous month"
              >
                ◀
              </span>
            )}

            {/* left edge — writing window length */}
            {canDrag && (
              <span
                onPointerDown={beginDrag("draftEdge")}
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                title="Drag to change how long the leads get to write"
                aria-hidden
              />
            )}

            {/* the writing/build seam */}
            <span
              onPointerDown={canDrag ? beginDrag("buildEdge") : undefined}
              className={`absolute inset-y-0 w-px bg-brand-200/45 ${canDrag ? "cursor-ew-resize" : ""}`}
              style={{ left: `${buildPct}%` }}
              title={canDrag ? "Drag to change the build + review window" : undefined}
              aria-hidden
            />
          </div>

          {/* send day cap — the one hard deadline, drawn as a tick that
              rises out of the band rather than another shape beside it */}
          <span
            aria-hidden
            className="pointer-events-none z-20 self-center justify-self-center"
            style={{ gridColumn: `${endCol + 1} / span 1` }}
          >
            <span
              className="block w-[3px] rounded-full bg-brand-200"
              style={{ height: 26, opacity: frozen ? 0.5 : 1 }}
            />
          </span>
        </div>

        {/* day numbers, sparse — every date under its own column would be
            noise at 31 columns; the milestones name themselves below */}
        <div
          className="mt-1 grid select-none text-[9px] leading-none text-subtle"
          style={{ gridTemplateColumns: "repeat(31, minmax(0,1fr))" }}
          aria-hidden
        >
          {days.map((d, i) => (
            <span key={d} className="text-center">
              {(i + 1) % 7 === 0 || i === 0 ? i + 1 : ""}
            </span>
          ))}
        </div>
      </div>

      {/* ── the four dates in words ────────────────────────────────── */}
      <dl className="mt-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12.5px]">
        <Milestone label="Writing" value={`${shortDay(shown.draftOpen)} – ${shortDay(shown.draftDue)}`} />
        <Milestone label="Build + review" value={`${shortDay(shown.buildStart)} – ${shortDay(shown.approvalDue)}`} />
        <Milestone label="Sends" value={longDay(shown.sendDate)} strong />
      </dl>

      {children}
    </section>
  );
}

// ── helpers ─────────────────────────────────────────────────────────

function computePreview(drag: DragState, deltaDays: number, holidays: string[]): Shown {
  const o = drag.origin;
  if (drag.kind === "move") {
    const raw = shiftIso(o.sendDate, deltaDays);
    const sendDate = snapToSendDay(raw, holidays, deltaDays >= 0 ? "forward" : "backward");
    const draftDays = Math.max(1, businessDaysBetween(o.draftOpen, o.draftDue, holidays));
    const buildDays = Math.max(1, businessDaysBetween(o.buildStart, o.approvalDue, holidays));
    return planFromSendDate(sendDate, o.month, { draftDays, buildDays, holidays }) as Shown;
  }

  if (drag.kind === "draftEdge") {
    const base = Math.max(1, businessDaysBetween(o.draftOpen, o.draftDue, holidays));
    const draftDays = clamp(base - deltaDays, 1, 10);
    const buildDays = Math.max(1, businessDaysBetween(o.buildStart, o.approvalDue, holidays));
    return planFromSendDate(o.sendDate, o.month, { draftDays, buildDays, holidays }) as Shown;
  }

  const baseBuild = Math.max(1, businessDaysBetween(o.buildStart, o.approvalDue, holidays));
  const buildDays = clamp(baseBuild - deltaDays, 1, 10);
  const draftDays = Math.max(1, businessDaysBetween(o.draftOpen, o.draftDue, holidays));
  return planFromSendDate(o.sendDate, o.month, { draftDays, buildDays, holidays }) as Shown;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function monthName(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function longDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Milestone({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-subtle">{label}</dt>
      <dd className={`m-0 ${strong ? "font-semibold text-fg" : "text-muted"}`}>{value}</dd>
    </div>
  );
}

/**
 * Status as a sentence, not a chip. Says what is true right now and what
 * happens next, which is the thing a coordinator actually wants.
 */
function StatusLine({ cycle, today }: { cycle: LaneCycle; today: string }) {
  let text: string;
  let tone = "text-subtle";
  if (cycle.status === "sent") {
    text = "Sent";
  } else if (cycle.status === "approved") {
    text = `Approved — goes out ${shortDay(cycle.sendDate)}`;
    tone = "text-emerald-600";
  } else if (today >= cycle.buildStart && today <= cycle.sendDate) {
    text = "Building now";
    tone = "text-brand-400";
  } else if (today >= cycle.draftOpen && today < cycle.buildStart) {
    text = "Drafts open";
    tone = "text-brand-400";
  } else {
    text = "Planned";
  }
  return <p className={`text-[11.5px] font-semibold ${tone}`}>{text}</p>;
}
