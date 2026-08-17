"use client";

/**
 * One month of the newsletter calendar, drawn as an actual calendar —
 * seven columns, week per row, day numbers in their real squares.
 *
 * The production window is laid over the grid the way a multi-day event
 * is in any calendar app: one bar segment per week row, so a window that
 * crosses a weekend wraps onto the next line and only the true first and
 * last ends are rounded. Writing and build are separate bars because they
 * mean different things to different people; the send day is a filled
 * square, because it is the one date that is not a window.
 *
 * Dragging any part of the window moves the whole issue. The send date
 * snaps to Tuesday/Wednesday/Thursday, so dragging onto a Friday will not
 * land there — the rule teaches itself. Window lengths are changed with
 * the steppers under the grid rather than by grabbing a 4px edge inside a
 * wrapped bar, which is a miserable target on any screen and impossible
 * on a phone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  isBusinessDay,
  planFromSendDate,
  snapToSendDay,
  stepSendDay,
  weekdayOf,
} from "@/lib/newsletter/schedule";

const WEEKDAY_HEAD = ["S", "M", "T", "W", "T", "F", "S"];

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

type Shown = Pick<LaneCycle, "draftOpen" | "draftDue" | "buildStart" | "approvalDue" | "sendDate">;

interface DragState {
  grabDate: string;
  origin: LaneCycle;
}

// ── date helpers (UTC-only, same discipline as schedule.ts) ──────────

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const shift = (s: string, days: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};
const diffDays = (a: string, b: string) =>
  Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);

export function NewsletterMonthGrid({
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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Shown | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const shown: Shown = preview ?? cycle;
  const frozen = cycle.status === "approved" || cycle.status === "sent";
  const canDrag = draggable && !frozen;

  /** Every cell of the visible grid, including the greyed spill-over days. */
  const { cells, weeks } = useMemo(() => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = first.getUTCDay(); // Sunday-first, as a wall calendar reads
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const total = Math.ceil((lead + daysInMonth) / 7) * 7;
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - lead);
    const out: string[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      out.push(iso(d));
    }
    return { cells: out, weeks: total / 7 };
  }, [y, m]);

  const inMonth = useCallback((d: string) => d.slice(0, 7) === cycle.month.slice(0, 7), [cycle.month]);

  /** Which date the pointer is over, from grid geometry. */
  const dateAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const col = Math.min(6, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 7)));
      const row = Math.min(weeks - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * weeks)));
      return cells[row * 7 + col] ?? null;
    },
    [cells, weeks],
  );

  const beginDrag = (e: React.PointerEvent) => {
    if (!canDrag) return;
    const grabDate = dateAt(e.clientX, e.clientY);
    if (!grabDate) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ grabDate, origin: cycle });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const over = dateAt(e.clientX, e.clientY);
    if (!over) return;
    const delta = diffDays(over, drag.grabDate);
    const raw = shift(drag.origin.sendDate, delta);
    const sendDate = snapToSendDay(raw, holidays, delta >= 0 ? "forward" : "backward");
    const draftDays = Math.max(1, diffBusiness(drag.origin.draftOpen, drag.origin.draftDue, holidays));
    const buildDays = Math.max(1, diffBusiness(drag.origin.buildStart, drag.origin.approvalDue, holidays));
    setPreview(planFromSendDate(sendDate, drag.origin.month, { draftDays, buildDays, holidays }));
  };

  const endDrag = () => {
    if (!drag) return;
    const next = preview;
    setDrag(null);
    setPreview(null);
    if (next && next.sendDate !== cycle.sendDate) onCommit({ sendDate: next.sendDate });
  };

  // Esc abandons a drag in flight.
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

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!canDrag) return;
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    onCommit({ sendDate: stepSendDay(cycle.sendDate, step as 1 | -1, holidays) });
  };

  const draftDays = Math.max(1, diffBusiness(shown.draftOpen, shown.draftDue, holidays));
  const buildDays = Math.max(1, diffBusiness(shown.buildStart, shown.approvalDue, holidays));

  return (
    <section className="py-6" aria-label={`${monthName(y, m)} newsletter`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── the calendar ────────────────────────────────────────── */}
        <div className="w-full shrink-0 lg:w-[19rem]">
          <div className="flex items-baseline justify-between pb-2">
            <h3
              className={`text-[14px] tracking-tight ${frozen ? "font-semibold text-muted" : "font-bold text-fg"}`}
            >
              {monthName(y, m)}
            </h3>
            <StatusLine cycle={cycle} today={today} />
          </div>

          {/* weekday header */}
          <div className="grid grid-cols-7 border-b border-line pb-1">
            {WEEKDAY_HEAD.map((w, i) => (
              <span
                key={i}
                className="text-center text-[10px] font-bold uppercase tracking-[0.08em] text-subtle"
              >
                {w}
              </span>
            ))}
          </div>

          {/* the month */}
          <div
            ref={gridRef}
            role={canDrag ? "application" : undefined}
            tabIndex={canDrag ? 0 : -1}
            aria-label={
              canDrag
                ? `${monthName(y, m)} — sends ${longDay(shown.sendDate)}. Drag the highlighted days to move the issue, or use the arrow keys.`
                : undefined
            }
            onKeyDown={onKeyDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`relative grid touch-none grid-cols-7 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
              drag ? "cursor-grabbing" : ""
            }`}
            style={{ gridTemplateRows: `repeat(${weeks}, 2.15rem)` }}
          >
            {/* day numbers */}
            {cells.map((d, i) => {
              const out = !inMonth(d);
              const off = !isBusinessDay(d, holidays);
              const isToday = d === today;
              return (
                <div
                  key={d}
                  // Placed explicitly. Auto-placement would flow AROUND the
                  // explicitly-positioned bars below and shunt later days
                  // onto the wrong row — days 19-22 ended up a line low.
                  style={{ gridRow: Math.floor(i / 7) + 1, gridColumn: (i % 7) + 1 }}
                  className="relative flex items-start justify-center border-b border-r border-line/40 pt-1 last:border-r-0"
                >
                  <span
                    className={`relative z-20 text-[11px] leading-none ${
                      out
                        ? "text-subtle/40"
                        : isToday
                          ? "font-bold text-brand-200"
                          : off
                            ? "text-subtle"
                            : "text-muted"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {isToday && (
                    <span
                      aria-hidden
                      className="absolute inset-x-1 top-0.5 z-10 h-[1.15rem] rounded-full bg-brand-400/15 ring-1 ring-brand-400/50"
                    />
                  )}
                </div>
              );
            })}

            {/* the window, wrapped week by week */}
            <Bars
              cells={cells}
              weeks={weeks}
              from={shown.draftOpen}
              to={shown.draftDue}
              tone="writing"
              label="Writing"
              onPointerDown={beginDrag}
              interactive={canDrag}
              frozen={frozen}
            />
            <Bars
              cells={cells}
              weeks={weeks}
              from={shown.buildStart}
              to={shown.approvalDue}
              tone="build"
              label="Build"
              onPointerDown={beginDrag}
              interactive={canDrag}
              frozen={frozen}
            />
            <Bars
              cells={cells}
              weeks={weeks}
              from={shown.sendDate}
              to={shown.sendDate}
              tone="send"
              label="Send"
              onPointerDown={beginDrag}
              interactive={canDrag}
              frozen={frozen}
            />
          </div>

          {/* legend + window steppers */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Legend tone="writing" label={`Writing ${draftDays}d`} />
            {canDrag && (
              <Stepper
                onDown={() => onCommit({ draftDays: Math.max(1, draftDays - 1) })}
                onUp={() => onCommit({ draftDays: Math.min(10, draftDays + 1) })}
                label="writing days"
              />
            )}
            <Legend tone="build" label={`Build ${buildDays}d`} />
            {canDrag && (
              <Stepper
                onDown={() => onCommit({ buildDays: Math.max(1, buildDays - 1) })}
                onUp={() => onCommit({ buildDays: Math.min(10, buildDays + 1) })}
                label="build days"
              />
            )}
            <Legend tone="send" label="Send" />
          </div>
        </div>

        {/* ── the detail column ───────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[12.5px]">
            <Milestone label="Writing" value={`${shortDay(shown.draftOpen)} – ${shortDay(shown.draftDue)}`} />
            <Milestone label="Build + review" value={`${shortDay(shown.buildStart)} – ${shortDay(shown.approvalDue)}`} />
            <Milestone label="Sends" value={longDay(shown.sendDate)} strong />
          </dl>
          {children}
        </div>
      </div>
    </section>
  );
}

// ── the wrapped bar ─────────────────────────────────────────────────

const TONE: Record<string, { bg: string; text: string }> = {
  writing: {
    bg: "linear-gradient(90deg, color-mix(in srgb, var(--brand-700) 62%, transparent), color-mix(in srgb, var(--brand-600) 62%, transparent))",
    text: "text-brand-100",
  },
  build: {
    bg: "linear-gradient(90deg, color-mix(in srgb, var(--brand-600) 70%, transparent), color-mix(in srgb, var(--brand-500) 78%, transparent))",
    text: "text-brand-50",
  },
  send: {
    bg: "linear-gradient(90deg, var(--brand-400), var(--brand-300))",
    text: "text-brand-900",
  },
};

/**
 * A date range as one bar per week row — the standard way a calendar
 * draws a multi-day event. Ends are rounded only where the range really
 * begins and ends, so a wrap reads as continuation rather than as two
 * separate things.
 */
function Bars({
  cells,
  weeks,
  from,
  to,
  tone,
  label,
  onPointerDown,
  interactive,
  frozen,
}: {
  cells: string[];
  weeks: number;
  from: string;
  to: string;
  tone: keyof typeof TONE;
  label: string;
  onPointerDown: (e: React.PointerEvent) => void;
  interactive: boolean;
  frozen: boolean;
}) {
  const segments: { row: number; col: number; span: number; first: boolean; last: boolean }[] = [];
  for (let row = 0; row < weeks; row++) {
    const rowStart = cells[row * 7];
    const rowEnd = cells[row * 7 + 6];
    if (to < rowStart || from > rowEnd) continue;
    const segFrom = from > rowStart ? from : rowStart;
    const segTo = to < rowEnd ? to : rowEnd;
    const col = cells.indexOf(segFrom) - row * 7;
    const span = diffDays(segTo, segFrom) + 1;
    if (col < 0 || span < 1) continue;
    segments.push({ row, col, span, first: segFrom === from, last: segTo === to });
  }

  const t = TONE[tone];
  return (
    <>
      {segments.map((s, i) => (
        <div
          key={`${tone}-${i}`}
          onPointerDown={interactive ? onPointerDown : undefined}
          className={`pointer-events-auto z-10 mx-px self-end mb-0.5 flex items-center justify-center overflow-hidden text-[8.5px] font-bold uppercase tracking-[0.06em] ${t.text} ${
            interactive ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          style={{
            gridRow: s.row + 1,
            gridColumn: `${s.col + 1} / span ${s.span}`,
            height: "0.8rem",
            background: t.bg,
            opacity: frozen ? 0.45 : 1,
            borderTopLeftRadius: s.first ? 999 : 2,
            borderBottomLeftRadius: s.first ? 999 : 2,
            borderTopRightRadius: s.last ? 999 : 2,
            borderBottomRightRadius: s.last ? 999 : 2,
          }}
          title={label}
        >
          {s.span >= 3 || tone === "send" ? label : ""}
        </div>
      ))}
    </>
  );
}

function Legend({ tone, label }: { tone: keyof typeof TONE; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span
        aria-hidden
        className="inline-block h-2 w-4 rounded-full"
        style={{ background: TONE[tone].bg }}
      />
      {label}
    </span>
  );
}

function Stepper({
  onDown,
  onUp,
  label,
}: {
  onDown: () => void;
  onUp: () => void;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={onDown}
        aria-label={`One fewer ${label}`}
        className="text-subtle transition-colors hover:text-fg"
      >
        <Minus size={11} />
      </button>
      <button
        onClick={onUp}
        aria-label={`One more ${label}`}
        className="text-subtle transition-colors hover:text-fg"
      >
        <Plus size={11} />
      </button>
    </span>
  );
}

// ── small helpers ───────────────────────────────────────────────────

function diffBusiness(from: string, to: string, holidays: string[]): number {
  if (to < from) return 0;
  let count = 0;
  let cur = from;
  for (let guard = 0; guard < 400 && cur <= to; guard++) {
    if (isBusinessDay(cur, holidays)) count++;
    cur = shift(cur, 1);
  }
  return count;
}

function monthName(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDay(s: string): string {
  return parse(s).toLocaleDateString("en-CA", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function longDay(s: string): string {
  return parse(s).toLocaleDateString("en-CA", {
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

function StatusLine({ cycle, today }: { cycle: LaneCycle; today: string }) {
  let text: string;
  let tone = "text-subtle";
  if (cycle.status === "sent") {
    text = "Sent";
  } else if (cycle.status === "approved") {
    text = "Approved";
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
  return <p className={`text-[11px] font-semibold ${tone}`}>{text}</p>;
}
