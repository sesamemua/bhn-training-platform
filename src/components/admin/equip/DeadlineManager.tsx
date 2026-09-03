"use client";
/**
 * Admin manager for Equip funding-window deadlines.
 *
 * Two views toggled by tab:
 *   • List view — combined month-by-month table showing VentureConnect
 *                 and VentureLift side by side. Per-row inline actions:
 *                 extend / close / reopen / edit / delete.
 *   • Calendar view — month-grid of upcoming windows. Read-only.
 *
 * Both views call the same /api/admin/equip/deadlines endpoints.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Plus, Trash2, Lock, Unlock, FastForward, Pencil, X,
  Calendar, List, AlertCircle, ChevronLeft, ChevronRight,
  ExternalLink, Sparkles,
} from "lucide-react";
import { holidayDateSet, UOFT_HOLIDAYS } from "@/lib/equip/calendar";

interface Deadline {
  id: string;
  stream: string;
  deadlineAt: string | Date;
  originalDeadlineAt: string | Date;
  status: string;
  cycleLabel: string | null;
  note: string | null;
  closedAt: string | Date | null;
  extendedAt: string | Date | null;
  createdAt: string | Date;
}

/** One stage from a VentureLift round — serialised plain object
 *  (page.tsx flattens VL_ROUNDS constants into this shape). */
interface VlRoundStage {
  roundNumber: number;
  roundLabel:  string;   // "Round 5"
  roundYear:   number;
  stageKey:    string;   // "pre_screening_deadline" | "full_app_deadline" | …
  stageLabel:  string;   // "Pre-screening deadline"
  date:        string;   // yyyy-mm-dd start date
  endDate:     string | null;
  approximate: boolean;
  tone:        "amber" | "violet" | "brand" | "emerald" | "neutral";
}

interface Props {
  initial: Deadline[];
  vlRoundStages: VlRoundStage[];
}

const STREAM_META: Record<string, { label: string; cap: string; tone: "brand" | "success" }> = {
  venture_connect: { label: "VentureConnect", cap: "≤$5,000 / monthly cycle",  tone: "brand" },
  venture_lift:    { label: "VentureLift",    cap: "≤$25,000 / quarterly cycle", tone: "success" },
};

/** Flatten the UOFT_HOLIDAYS list into a Record keyed by Toronto
 *  yyyy-mm-dd so the calendar's per-cell lookup is O(1).
 *  Memoised at module level — the holiday schedule is static
 *  data, no need to recompute per render. */
const _HOLIDAYS_BY_DATE: Record<string, { name: string; presidential?: boolean }> = (() => {
  const out: Record<string, { name: string; presidential?: boolean }> = {};
  const m = holidayDateSet();
  m.forEach((h, key) => {
    out[key] = { name: h.name, presidential: h.presidential };
  });
  return out;
})();
function holidaysByDateRecord() { return _HOLIDAYS_BY_DATE; }

function noonEasternIso(yyyymmdd: string): string {
  // Strategy: build a Date by interpreting "yyyy-mm-ddT12:00:00" in
  // the America/Toronto zone. We do this by:
  //   1. Construct a Date assuming local zone with the same wall
  //      clock.
  //   2. Get its Toronto offset via Intl.DateTimeFormat.
  //   3. Adjust.
  // Simpler: use the toLocaleString tz round-trip trick.
  const [y, m, d] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
  // Start with "noon-ish" in UTC; we'll iterate-adjust if the
  // resulting Toronto wall-clock isn't 12:00.
  let candidate = new Date(Date.UTC(y, m - 1, d, 17, 0, 0)); // noon EST = 17:00 UTC
  // Verify by reading back what Toronto sees.
  const torontoHour = parseInt(
    candidate.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }),
    10,
  );
  // If DST in effect, Toronto sees 13:00 — back off by 1h.
  if (torontoHour === 13) {
    candidate = new Date(candidate.getTime() - 60 * 60 * 1000);
  } else if (torontoHour === 11) {
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
  }
  return candidate.toISOString();
}

function formatTorontoForDisplay(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return date.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
  });
}

/** "YYYY-MM-DD" in Toronto-local time — used to pre-fill the
 *  HTML `<input type=date>` in the Edit form so the row's existing
 *  deadline appears in the picker. */
function torontoDateInput(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  // en-CA's default locale string is YYYY-MM-DD, which is what
  // <input type="date"> expects.
  return date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** "HH:MM" (24h) in Toronto-local time — used to pre-fill the
 *  HTML `<input type=time>` in the Edit form. */
function torontoTimeInput(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  const hhmm = date.toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // en-CA + hour12=false renders 00:00 as "24:00" in some browsers; normalise.
  return hhmm.replace(/^24/, "00");
}

export function DeadlineManager({ initial, vlRoundStages }: Props) {
  const [tab, setTab] = useState<"list" | "calendar">("list");

  return (
    <div className="space-y-5">
      {/*
        View toggle. Underline-with-fade pattern (rather than the
        old solid pills) so the page's tone stays consistent: brand
        on the active tab, soft hairline between, slate muted on
        the inactive one. The horizontal gradient rule under the
        whole strip ties it into the hero's gradient bottom rule.
      */}
      <nav className="flex items-end gap-1 border-b border-line/70">
        {([
          { id: "list",     icon: List,     label: "List" },
          { id: "calendar", icon: Calendar, label: "Calendar" },
        ] as const).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                "inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 -mb-px border-b-2 transition-colors " +
                (active
                  ? "text-brand-700 border-brand-600"
                  : "text-muted border-transparent hover:text-fg hover:border-line-strong")
              }
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </nav>

      <NewDeadlineForm />

      {tab === "list"     ? <ListView     deadlines={initial} vlRoundStages={vlRoundStages} /> : null}
      {tab === "calendar" ? <CalendarView deadlines={initial} holidaysByDate={holidaysByDateRecord()} /> : null}
    </div>
  );
}

function NewDeadlineForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stream, setStream] = useState("venture_connect");
  const [date, setDate] = useState<string>(() => {
    // Default to next-month-end for convenience.
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState("12:00");
  const [cycleLabel, setCycleLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    let deadlineIso: string;
    if (time === "12:00") {
      deadlineIso = noonEasternIso(date);
    } else {
      // Custom time — interpret as Toronto local wall-clock by
      // building an ISO that we'll feed through the same tz-shift
      // adjustment as noonEasternIso.
      const [hh, mm] = time.split(":").map((s) => parseInt(s, 10));
      const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
      let candidate = new Date(Date.UTC(y, m - 1, d, hh + 5, mm, 0));
      const torontoHour = parseInt(
        candidate.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }),
        10,
      );
      if (torontoHour === hh + 1) {
        candidate = new Date(candidate.getTime() - 60 * 60 * 1000);
      } else if (torontoHour === hh - 1) {
        candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
      }
      deadlineIso = candidate.toISOString();
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/equip/deadlines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stream, deadlineAt: deadlineIso, cycleLabel: cycleLabel || undefined, note: note || undefined }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Failed to create deadline.");
        setCycleLabel("");
        setNote("");
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <section
      className="rounded-2xl border border-line/70 p-5"
      style={{
        // Soft brand-tinted gradient so the form reads as the page's
        // "input pane" without needing a heavy ring/shadow. Hairline
        // border keeps it visually quiet relative to the table below.
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--brand-50) 30%, var(--card)) 0%, var(--card) 60%)",
      }}
    >
      <p className="mb-3 text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
        Create a new funding window
      </p>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_1fr_1fr_auto] gap-2 items-end">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Stream</span>
          <select
            value={stream}
            onChange={(e) => setStream(e.target.value)}
            className="mt-1 w-full bg-card-solid border border-line rounded-lg px-2 py-2 text-sm"
          >
            <option value="venture_connect">VentureConnect</option>
            <option value="venture_lift">VentureLift</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full bg-card-solid border border-line rounded-lg px-2 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Time (ET)</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full bg-card-solid border border-line rounded-lg px-2 py-2 text-sm font-mono"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Cycle label (optional)</span>
          <input
            type="text"
            placeholder="May 2026 cycle"
            value={cycleLabel}
            onChange={(e) => setCycleLabel(e.target.value)}
            className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Note (optional)</span>
          <input
            type="text"
            placeholder="Moved from May 1 because of the holiday Monday"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-xl"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add window
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5 mt-3">
          <AlertCircle size={11} /> {error}
        </p>
      )}
      <p className="text-[11px] text-subtle mt-3">
        Time defaults to <strong>12:00 PM Eastern</strong> on the chosen date — the standard noon-EST cut-off from the PDFs. Adjust the time field above if you need an off-hours deadline. DST is handled automatically.
      </p>
    </section>
  );
}

// ── Combined list-view helpers ─────────────────────────────────────────────────

/** "YYYY-MM" in Toronto-local time — used to bucket deadlines by month. */
function torontoYYYYMM(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7);
}

/** Compact display format: "Sep 25, 12:00 PM ET" */
function formatShort(dateLike: string | Date): string {
  const date = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  return date.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
  });
}

/**
 * Flat status indicator — dot + small caps label, no pill.
 *
 * Replaces the design-system Badge for the deadlines page only.
 * Badge pills were the densest visual element on the page; flattening
 * to "dot + label" matches the rest of the minimalist treatment
 * (left-border accents instead of card fills, hairline dividers
 * instead of rings).
 *
 * Dot colours stay inside the 4-colour palette: emerald (open),
 * brand (extended/info), rose (closed), slate (scheduled / unknown).
 */
function getStatusBadge(status: string) {
  const map: Record<string, { dot: string; text: string; label: string }> = {
    open:      { dot: "bg-emerald-600", text: "text-emerald-700", label: "Open"      },
    extended:  { dot: "bg-brand-500",   text: "text-brand-700",   label: "Extended"  },
    closed:    { dot: "bg-rose-500",    text: "text-rose-700",    label: "Closed"    },
    scheduled: { dot: "bg-slate-400",   text: "text-slate-600",   label: "Scheduled" },
  };
  const m = map[status] ?? { dot: "bg-slate-400", text: "text-slate-600", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]">
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      <span className={m.text}>{m.label}</span>
    </span>
  );
}

/**
 * Month abbreviation marker.
 *
 * The month cell renders as a filled deep-slate block with inverted
 * (light) text — visually anchors the row from the left edge and
 * separates the timeline rhythm from the per-stream data on its
 * right. Single colour family (slate-800 fill + slate-100 abbr +
 * slate-400 year) so it stays inside the page's tonal contract
 * without introducing a new accent hue.
 */
const MONTH_DISPLAY: Record<number, { abbr: string; color: string }> = {
  1:  { abbr: "Jan", color: "text-slate-100" },
  2:  { abbr: "Feb", color: "text-slate-100" },
  3:  { abbr: "Mar", color: "text-slate-100" },
  4:  { abbr: "Apr", color: "text-slate-100" },
  5:  { abbr: "May", color: "text-slate-100" },
  6:  { abbr: "Jun", color: "text-slate-100" },
  7:  { abbr: "Jul", color: "text-slate-100" },
  8:  { abbr: "Aug", color: "text-slate-100" },
  9:  { abbr: "Sep", color: "text-slate-100" },
  10: { abbr: "Oct", color: "text-slate-100" },
  11: { abbr: "Nov", color: "text-slate-100" },
  12: { abbr: "Dec", color: "text-slate-100" },
};

/** Compact date label for a VL stage: "Sep 19" or "Sep 22–26". */
function fmtStageDate(s: VlRoundStage): string {
  const start = new Date(s.date + "T12:00:00-04:00");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (!s.endDate) return s.approximate ? `~${startStr}` : startStr;
  const end = new Date(s.endDate + "T12:00:00-04:00");
  const sameMonth = start.getMonth() === end.getMonth();
  const endStr = sameMonth
    ? end.toLocaleDateString("en-US", { day: "numeric" })
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startStr}–${endStr}`;
}

/**
 * Filled dot colour per stage tone.
 *
 * Collapsed to the page's four-colour palette + muted one step
 * toward the darker end (-600/-500) so the dots feel calm rather
 * than vibrant. The legacy "violet" tone folds into brand.
 */
function vlStageDot(tone: VlRoundStage["tone"]): string {
  switch (tone) {
    case "amber":   return "bg-amber-500";
    case "violet":  return "bg-brand-500";
    case "brand":   return "bg-brand-500";
    case "emerald": return "bg-emerald-600";
    default:        return "bg-line-strong";
  }
}

/**
 * Subtle background tint keyed by VentureLift round number.
 *
 * Used to be five different hues; now a single-hue gradient by
 * intensity (brand-50/40 → brand-50/70 → brand-100/60 …). Reads as
 * "different rounds, same family" — your eye still distinguishes
 * them but the page doesn't look like a paint chart.
 */
function vlRoundBgByNumber(n: number): string {
  const palette: Record<number, string> = {
    3: "bg-brand-50/30",
    4: "bg-brand-50/50",
    5: "bg-brand-50/70",
    6: "bg-brand-100/40",
    7: "bg-brand-100/60",
  };
  return palette[n] ?? "";
}

/** Same as vlRoundBgByNumber but accepts the cycleLabel string used
 *  on EquipDeadline rows (e.g. "Round 6 · Pre-screening deadline"). */
function vlRoundBg(cycleLabel: string | null | undefined): string {
  if (!cycleLabel) return "";
  const m = cycleLabel.match(/Round (\d+)/i);
  if (!m) return "";
  return vlRoundBgByNumber(parseInt(m[1], 10));
}

type SideMode = "idle" | "extend" | "close" | "edit" | "delete";

interface MonthGroup {
  monthKey:  string;          // "YYYY-MM"
  label:     string;          // "January 2026"
  vc:        Deadline | null;
  vl:        Deadline | null; // actionable VL deadline (pre-screening or full app)
  vlStages:  VlRoundStage[];  // ALL VL stages starting this month (for timeline)
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ deadlines, vlRoundStages }: { deadlines: Deadline[]; vlRoundStages: VlRoundStage[] }) {
  if (deadlines.length === 0 && vlRoundStages.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-card p-12 text-center surface-shadow">
        <p className="font-medium text-fg">No deadlines yet</p>
        <p className="text-sm text-muted mt-1">Create your first funding window using the form above.</p>
      </div>
    );
  }
  return <CombinedTable deadlines={deadlines} vlRoundStages={vlRoundStages} />;
}

function CombinedTable({ deadlines, vlRoundStages }: { deadlines: Deadline[]; vlRoundStages: VlRoundStage[] }) {
  const [hidePast, setHidePast] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const groups = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, MonthGroup>();

    function ensureGroup(key: string, isoDate: string) {
      if (!map.has(key)) {
        // Build a label from the key directly ("2026-05" → "May 2026")
        // using a dummy noon-UTC date so toLocaleDateString is stable.
        const [y, m] = key.split("-").map(Number);
        const label = new Date(Date.UTC(y, m - 1, 15))
          .toLocaleDateString("en-US", { month: "long", year: "numeric" });
        void isoDate; // used only when we need a real Date — key is enough
        map.set(key, { monthKey: key, label, vc: null, vl: null, vlStages: [] });
      }
    }

    // Bucket EquipDeadline rows by Toronto month
    for (const d of deadlines) {
      const key = torontoYYYYMM(d.deadlineAt);
      ensureGroup(key, typeof d.deadlineAt === "string" ? d.deadlineAt : d.deadlineAt.toISOString());
      const g = map.get(key)!;
      if (d.stream === "venture_connect") {
        if (!g.vc || new Date(d.deadlineAt) > new Date(g.vc.deadlineAt)) g.vc = d;
      } else if (d.stream === "venture_lift") {
        if (!g.vl || new Date(d.deadlineAt) > new Date(g.vl.deadlineAt)) g.vl = d;
      }
    }

    // Bucket VL round stages by the stage's start-date month
    for (const s of vlRoundStages) {
      const key = s.date.slice(0, 7); // "yyyy-mm" directly from "yyyy-mm-dd"
      ensureGroup(key, s.date + "T12:00:00Z");
      map.get(key)!.vlStages.push(s);
    }

    // Sort stages within each group chronologically
    for (const g of map.values()) {
      g.vlStages.sort((a, b) => a.date.localeCompare(b.date));
    }

    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [deadlines, vlRoundStages]);

  const now = new Date();
  const isPast = (g: MonthGroup) => {
    const vcPast = !g.vc || new Date(g.vc.deadlineAt) < now;
    const vlDeadlinePast = !g.vl || new Date(g.vl.deadlineAt) < now;
    const hasUpcomingStage = g.vlStages.some((s) => (s.endDate ?? s.date) >= today);
    return vcPast && vlDeadlinePast && !hasUpcomingStage;
  };

  const pastCount = groups.filter(isPast).length;
  const visible   = hidePast ? groups.filter((g) => !isPast(g)) : groups;

  // ── UofT holiday legend (upcoming closures) ────────────────────
  const upcomingHolidays = UOFT_HOLIDAYS.filter(
    (h) => (h.endDate ?? h.date) >= today,
  ).slice(0, 6);

  return (
    <section className="rounded-2xl border border-line bg-card overflow-hidden surface-shadow">
      <header className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
          Key dates
        </p>
        {pastCount > 0 && (
          <button
            type="button"
            onClick={() => setHidePast((v) => !v)}
            className="text-xs text-muted hover:text-fg transition-colors"
          >
            {hidePast
              ? `Show ${pastCount} past month${pastCount !== 1 ? "s" : ""}`
              : "Hide past"}
          </button>
        )}
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[10px] text-muted uppercase tracking-wide">
            {/* Month-column header matches the inverted slate slab
                in the body cells — keeps the column visually
                continuous from header to last row. */}
            <th className="px-4 py-3 w-16 bg-slate-800 text-center text-slate-200">
              Month
            </th>
            <th className="px-5 py-3">
              <span className="text-brand-700 font-bold normal-case tracking-normal">VentureConnect</span>
              <span className="text-subtle font-normal ml-1.5 normal-case tracking-normal">≤$5K · monthly</span>
            </th>
            <th className="px-5 py-3">
              <span className="text-emerald-700 font-bold normal-case tracking-normal">VentureLift</span>
              <span className="text-subtle font-normal ml-1.5 normal-case tracking-normal">≤$25K · quarterly</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {visible.map((g) => (
            <CombinedMonthRow key={g.monthKey} group={g} today={today} />
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={3} className="px-5 py-8 text-center text-muted text-sm">
                {hidePast ? "No upcoming dates." : "No dates."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* U of T closure legend */}
      {upcomingHolidays.length > 0 && (
        <footer className="px-5 py-3 border-t border-line bg-elevated/30">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
                U of T closures · upcoming
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                Reviewers don&apos;t schedule consults or reviews on these dates.{" "}
                <a
                  href="https://people.utoronto.ca/memos/holiday-schedule-2025-26-and-2026-27/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 underline inline-flex items-center gap-1"
                >
                  Full schedule <ExternalLink size={9} />
                </a>
              </p>
            </div>
            <ul className="flex items-center gap-1.5 flex-wrap ml-auto">
              {upcomingHolidays.map((h) => (
                <li
                  key={h.date + h.name}
                  className={
                    "text-[10px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 inline-flex items-center gap-1 border-l-2 " +
                    // Holidays are now flat hairline markers — a 2 px
                    // left border in muted amber/rose carries the
                    // semantic without a rounded chip. Date label sits
                    // on neutral text so the page stops looking like
                    // a chip cloud.
                    (h.presidential
                      ? "border-amber-500 text-amber-800"
                      : "border-rose-400 text-rose-700")
                  }
                  title={h.name}
                >
                  {new Date(h.date + "T12:00:00-04:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {h.endDate && (
                    <>–{new Date(h.endDate + "T12:00:00-04:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                  )}
                  <span className="opacity-75">· {h.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </footer>
      )}
    </section>
  );
}

function CombinedMonthRow({ group, today }: { group: MonthGroup; today: string }) {
  const router = useRouter();
  const now    = new Date();

  // ── VentureConnect side state ──────────────────────────────────
  const [vcPending, startVcTransition] = useTransition();
  const [vcMode, setVcMode]             = useState<SideMode>("idle");
  const [vcNewDate, setVcNewDate]       = useState(() => {
    if (!group.vc) return "";
    const next = new Date(group.vc.deadlineAt);
    next.setDate(next.getDate() + 7);
    return next.toISOString().slice(0, 10);
  });
  const [vcNewTime, setVcNewTime]         = useState("12:00");
  const [vcCloseNote, setVcCloseNote]     = useState("");
  const [vcEditDate, setVcEditDate]       = useState(() => group.vc ? torontoDateInput(group.vc.deadlineAt) : "");
  const [vcEditTime, setVcEditTime]       = useState(() => group.vc ? torontoTimeInput(group.vc.deadlineAt) : "");
  const [vcCycleLabel, setVcCycleLabel]   = useState(group.vc?.cycleLabel ?? "");
  const [vcNote, setVcNote]               = useState(group.vc?.note ?? "");
  const [vcError, setVcError]             = useState<string | null>(null);

  // ── VentureLift side state ─────────────────────────────────────
  const [vlPending, startVlTransition] = useTransition();
  const [vlMode, setVlMode]             = useState<SideMode>("idle");
  const [vlNewDate, setVlNewDate]       = useState(() => {
    if (!group.vl) return "";
    const next = new Date(group.vl.deadlineAt);
    next.setDate(next.getDate() + 7);
    return next.toISOString().slice(0, 10);
  });
  const [vlNewTime, setVlNewTime]         = useState("12:00");
  const [vlCloseNote, setVlCloseNote]     = useState("");
  const [vlEditDate, setVlEditDate]       = useState(() => group.vl ? torontoDateInput(group.vl.deadlineAt) : "");
  const [vlEditTime, setVlEditTime]       = useState(() => group.vl ? torontoTimeInput(group.vl.deadlineAt) : "");
  const [vlCycleLabel, setVlCycleLabel]   = useState(group.vl?.cycleLabel ?? "");
  const [vlNote, setVlNote]               = useState(group.vl?.note ?? "");
  const [vlError, setVlError]             = useState<string | null>(null);

  // ── Mutation helpers ───────────────────────────────────────────
  function vcMutate(body: Record<string, unknown>) {
    if (!group.vc) return;
    setVcError(null);
    startVcTransition(async () => {
      try {
        const res = await fetch(`/api/admin/equip/deadlines/${group.vc!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Action failed");
        setVcMode("idle");
        router.refresh();
      } catch (e) {
        setVcError((e as Error).message);
      }
    });
  }

  function vcDel() {
    if (!group.vc) return;
    setVcError(null);
    startVcTransition(async () => {
      try {
        const res = await fetch(`/api/admin/equip/deadlines/${group.vc!.id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Delete failed");
        }
        router.refresh();
      } catch (e) {
        setVcError((e as Error).message);
      }
    });
  }

  function vlMutate(body: Record<string, unknown>) {
    if (!group.vl) return;
    setVlError(null);
    startVlTransition(async () => {
      try {
        const res = await fetch(`/api/admin/equip/deadlines/${group.vl!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Action failed");
        setVlMode("idle");
        router.refresh();
      } catch (e) {
        setVlError((e as Error).message);
      }
    });
  }

  function vlDel() {
    if (!group.vl) return;
    setVlError(null);
    startVlTransition(async () => {
      try {
        const res = await fetch(`/api/admin/equip/deadlines/${group.vl!.id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Delete failed");
        }
        router.refresh();
      } catch (e) {
        setVlError((e as Error).message);
      }
    });
  }

  const vcPast = group.vc ? new Date(group.vc.deadlineAt) < now : false;
  const vlPast = group.vl ? new Date(group.vl.deadlineAt) < now : false;

  return (
    <>
      {/* ── Main data row ─────────────────────────────────────── */}
      <tr className="align-top">

        {/*
          Month column — deep slate fill anchors the row from the
          left edge. Inverted text (slate-100 abbr, slate-400 year)
          reads cleanly on dark. The cell extends row-tall so the
          slab visually groups the VC + VL columns to its right.
        */}
        <td className="px-4 py-4 align-middle text-center w-16 bg-slate-800">
          {(() => {
            const monthNum = parseInt(group.monthKey.slice(5, 7), 10);
            const year     = group.monthKey.slice(0, 4);
            const m        = MONTH_DISPLAY[monthNum] ?? { abbr: group.label.slice(0, 3), color: "text-slate-100" };
            return (
              <>
                <span className={`block text-3xl font-black leading-none tracking-tight ${m.color}`}>
                  {m.abbr}
                </span>
                <span className="block text-[10px] text-slate-400 mt-1 font-medium tracking-wider uppercase">
                  {year}
                </span>
              </>
            );
          })()}
        </td>

        {/* VentureConnect column */}
        <td className={"px-5 py-3 align-top " + (vcPast && group.vc && group.vc.status !== "closed" ? "opacity-70" : "")}>
          {group.vc ? (
            <>
              <p className="font-bold text-fg text-[15px] leading-tight tabular-nums tracking-tight">{formatShort(group.vc.deadlineAt)}</p>
              {group.vc.extendedAt && (
                <p className="text-[10px] text-subtle">Was {formatShort(group.vc.originalDeadlineAt)}</p>
              )}
              {group.vc.cycleLabel && <p className="text-[10px] text-muted">{group.vc.cycleLabel}</p>}
              <div className="mt-1">{getStatusBadge(group.vc.status)}</div>
              {group.vc.note && <p className="text-[10px] text-muted mt-1 line-clamp-2">{group.vc.note}</p>}
              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {group.vc.status !== "closed" && (
                  <button type="button"
                    onClick={() => setVcMode(vcMode === "extend" ? "idle" : "extend")}
                    className="text-xs text-brand-700 hover:text-brand-900 inline-flex items-center gap-1">
                    <FastForward size={11} /> Extend
                  </button>
                )}
                {group.vc.status !== "closed" ? (
                  <button type="button"
                    onClick={() => setVcMode(vcMode === "close" ? "idle" : "close")}
                    className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1">
                    <Lock size={11} /> Close
                  </button>
                ) : (
                  <button type="button" onClick={() => vcMutate({ action: "reopen" })} disabled={vcPending}
                    className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 disabled:opacity-50">
                    {vcPending ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={11} />}
                    {" "}Reopen
                  </button>
                )}
                <button type="button"
                  onClick={() => setVcMode(vcMode === "edit" ? "idle" : "edit")}
                  className="text-xs text-muted hover:text-fg inline-flex items-center gap-1">
                  <Pencil size={11} />
                </button>
                <button type="button"
                  onClick={() => setVcMode(vcMode === "delete" ? "idle" : "delete")}
                  disabled={vcPending}
                  className={"text-xs inline-flex items-center gap-1 disabled:opacity-50 " +
                    (vcMode === "delete" ? "text-rose-900 font-semibold" : "text-rose-700 hover:text-rose-900")}>
                  <Trash2 size={11} />{vcMode === "delete" && <span>Delete?</span>}
                </button>
              </div>
              {vcError && (
                <p className="text-[11px] text-rose-700 mt-1 inline-flex items-center gap-1.5">
                  <AlertCircle size={11} /> {vcError}
                </p>
              )}
            </>
          ) : (
            <span className="text-subtle text-xs">—</span>
          )}
        </td>

        {/* VentureLift column — full round timeline for this month */}
        {(() => {
          // Pick the cell background from the actionable deadline or the
          // first stage's round number (whichever is available).
          const cellBg = group.vl?.cycleLabel
            ? vlRoundBg(group.vl.cycleLabel)
            : group.vlStages.length > 0
              ? vlRoundBgByNumber(group.vlStages[0].roundNumber)
              : "";

          // Build per-round groupings for the mini-timeline.
          const roundNums = [...new Set(group.vlStages.map((s) => s.roundNumber))];

          return (
            <td className={"px-5 py-3 align-top " + cellBg + (vlPast && group.vl && group.vl.status !== "closed" && group.vlStages.length === 0 ? " opacity-70" : "")}>
              {group.vlStages.length > 0 ? (
                <div className="space-y-3">
                  {roundNums.map((rn) => {
                    const stages = group.vlStages.filter((s) => s.roundNumber === rn);
                    const roundLabel = stages[0].roundLabel;
                    // The first future stage in this group is "next".
                    const firstFutureIdx = stages.findIndex((s) => s.date > today);

                    return (
                      <div key={rn}>
                        {/* Round chip — only show when multiple rounds share a month */}
                        {roundNums.length > 1 && (
                          <span className="inline-block text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-elevated text-muted ring-1 ring-line mb-1.5">
                            {roundLabel}
                          </span>
                        )}
                        <div className="space-y-1">
                          {stages.map((s, si) => {
                            const isActive = s.date <= today && (s.endDate ?? s.date) >= today;
                            const isNext   = !isActive && si === firstFutureIdx;
                            const isDeadlineStage =
                              s.stageKey === "pre_screening_deadline" ||
                              s.stageKey === "full_app_deadline";
                            // Match this stage to group.vl (the actionable deadline row).
                            const isThisVlDeadline =
                              isDeadlineStage &&
                              !!group.vl &&
                              (!group.vl.cycleLabel || group.vl.cycleLabel.includes(roundLabel));

                            return (
                              <div
                                key={s.stageKey + rn}
                                // Minimalist treatment — a 2 px left border in
                                // muted emerald/amber replaces the old pill-
                                // shaped card. No background fill, no ring. The
                                // accent is a line, not a chip; eye picks up
                                // "active vs next" by edge colour + label tone.
                                className={
                                  "px-2 py-1 border-l-2 " +
                                  (isActive
                                    ? "border-emerald-600"
                                    : isNext
                                      ? "border-amber-500"
                                      : "border-transparent")
                                }
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${vlStageDot(s.tone)}`} />
                                  <span className={
                                    "text-xs font-semibold " +
                                    (isActive ? "text-emerald-800" : isNext ? "text-amber-800" : "text-fg")
                                  }>
                                    {s.stageLabel}
                                  </span>
                                  {/*
                                    "Active" / "Next" markers as text-with-dot
                                    instead of pills. Muted emerald/amber tone,
                                    uppercase letter-spacing carries the eye
                                    without a chip wrapper.
                                  */}
                                  {isActive && (
                                    <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-emerald-700 inline-flex items-center gap-1">
                                      <Sparkles size={9} /> now
                                    </span>
                                  )}
                                  {isNext && (
                                    <span className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-amber-700">
                                      next
                                    </span>
                                  )}
                                  <span className={
                                    "text-[12.5px] font-mono tabular-nums ml-auto " +
                                    (isActive || isNext ? "font-bold " : "font-semibold ") +
                                    (isActive ? "text-emerald-700" : isNext ? "text-amber-700" : "text-fg")
                                  }>
                                    {fmtStageDate(s)}
                                  </span>
                                </div>

                                {/* Inline deadline actions for pre-screening / full-app stages */}
                                {isThisVlDeadline && (
                                  <>
                                    {group.vl!.extendedAt && (
                                      <p className="text-[10px] text-subtle mt-0.5 ml-3.5">
                                        Was {formatShort(group.vl!.originalDeadlineAt)}
                                      </p>
                                    )}
                                    <div className="mt-0.5 ml-3.5">{getStatusBadge(group.vl!.status)}</div>
                                    {group.vl!.note && (
                                      <p className="text-[10px] text-muted mt-0.5 ml-3.5 line-clamp-2">{group.vl!.note}</p>
                                    )}
                                    <div className="flex items-center gap-1 flex-wrap mt-1 ml-3.5">
                                      {group.vl!.status !== "closed" && (
                                        <button type="button"
                                          onClick={() => setVlMode(vlMode === "extend" ? "idle" : "extend")}
                                          className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1">
                                          <FastForward size={11} /> Extend
                                        </button>
                                      )}
                                      {group.vl!.status !== "closed" ? (
                                        <button type="button"
                                          onClick={() => setVlMode(vlMode === "close" ? "idle" : "close")}
                                          className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1">
                                          <Lock size={11} /> Close
                                        </button>
                                      ) : (
                                        <button type="button" onClick={() => vlMutate({ action: "reopen" })} disabled={vlPending}
                                          className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 disabled:opacity-50">
                                          {vlPending ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={11} />}
                                          {" "}Reopen
                                        </button>
                                      )}
                                      <button type="button"
                                        onClick={() => setVlMode(vlMode === "edit" ? "idle" : "edit")}
                                        className="text-xs text-muted hover:text-fg inline-flex items-center gap-1">
                                        <Pencil size={11} />
                                      </button>
                                      <button type="button"
                                        onClick={() => setVlMode(vlMode === "delete" ? "idle" : "delete")}
                                        disabled={vlPending}
                                        className={"text-xs inline-flex items-center gap-1 disabled:opacity-50 " +
                                          (vlMode === "delete" ? "text-rose-900 font-semibold" : "text-rose-700 hover:text-rose-900")}>
                                        <Trash2 size={11} />{vlMode === "delete" && <span>Delete?</span>}
                                      </button>
                                    </div>
                                    {vlError && (
                                      <p className="text-[11px] text-rose-700 mt-0.5 ml-3.5 inline-flex items-center gap-1.5">
                                        <AlertCircle size={11} /> {vlError}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : group.vl ? (
                // No stage data for this month but an EquipDeadline row exists
                // (e.g. admin-created one-off) — fall back to the old compact view.
                <>
                  <p className="font-bold text-fg text-[15px] leading-tight tabular-nums tracking-tight">{formatShort(group.vl.deadlineAt)}</p>
                  {group.vl.cycleLabel && <p className="text-[10px] text-muted">{group.vl.cycleLabel}</p>}
                  <div className="mt-1">{getStatusBadge(group.vl.status)}</div>
                  <div className="flex items-center gap-1 flex-wrap mt-1.5">
                    {group.vl.status !== "closed" && (
                      <button type="button" onClick={() => setVlMode(vlMode === "extend" ? "idle" : "extend")}
                        className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1">
                        <FastForward size={11} /> Extend
                      </button>
                    )}
                    {group.vl.status !== "closed" ? (
                      <button type="button" onClick={() => setVlMode(vlMode === "close" ? "idle" : "close")}
                        className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1">
                        <Lock size={11} /> Close
                      </button>
                    ) : (
                      <button type="button" onClick={() => vlMutate({ action: "reopen" })} disabled={vlPending}
                        className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 disabled:opacity-50">
                        {vlPending ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={11} />}
                        {" "}Reopen
                      </button>
                    )}
                    <button type="button" onClick={() => setVlMode(vlMode === "edit" ? "idle" : "edit")}
                      className="text-xs text-muted hover:text-fg inline-flex items-center gap-1">
                      <Pencil size={11} />
                    </button>
                    <button type="button" onClick={() => setVlMode(vlMode === "delete" ? "idle" : "delete")} disabled={vlPending}
                      className={"text-xs inline-flex items-center gap-1 disabled:opacity-50 " +
                        (vlMode === "delete" ? "text-rose-900 font-semibold" : "text-rose-700 hover:text-rose-900")}>
                      <Trash2 size={11} />{vlMode === "delete" && <span>Delete?</span>}
                    </button>
                  </div>
                  {vlError && (
                    <p className="text-[11px] text-rose-700 mt-1 inline-flex items-center gap-1.5">
                      <AlertCircle size={11} /> {vlError}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-subtle text-xs">—</span>
              )}
            </td>
          );
        })()}
      </tr>

      {/* ── VentureConnect action panels ──────────────────────── */}

      {vcMode === "extend" && group.vc && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-elevated/30">
          <div className="rounded-xl border border-brand-200 bg-card-solid p-3 space-y-2">
            <p className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">VentureConnect · Extend deadline</p>
            <p className="text-[11px] text-subtle">New deadline (ET). Must be after the current deadline.</p>
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
              <input type="date" value={vcNewDate} onChange={(e) => setVcNewDate(e.target.value)}
                className="bg-card-solid border border-line rounded-lg px-2 py-1.5 text-sm" />
              <input type="time" value={vcNewTime} onChange={(e) => setVcNewTime(e.target.value)}
                className="bg-card-solid border border-line rounded-lg px-2 py-1.5 text-sm font-mono" />
              <button type="button" disabled={vcPending}
                onClick={() => {
                  const iso = vcNewTime === "12:00"
                    ? noonEasternIso(vcNewDate)
                    : new Date(`${vcNewDate}T${vcNewTime}:00-05:00`).toISOString();
                  vcMutate({ action: "extend", deadlineAt: iso });
                }}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {vcPending ? <Loader2 size={11} className="animate-spin" /> : "Extend"}
              </button>
              <button type="button" onClick={() => setVcMode("idle")} className="text-xs text-muted hover:text-fg">
                <X size={11} />
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {vcMode === "close" && group.vc && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-elevated/30">
          <div className="rounded-xl border border-line bg-card-solid p-3 space-y-2">
            <p className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">VentureConnect · Close window</p>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Close note (optional)</span>
              <input type="text" value={vcCloseNote} onChange={(e) => setVcCloseNote(e.target.value)}
                placeholder="Reason for early close — applicants see this on /equip"
                className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setVcMode("idle")} className="text-xs text-muted hover:text-fg">Cancel</button>
              <button type="button" disabled={vcPending}
                onClick={() => vcMutate({ action: "close", note: vcCloseNote || undefined })}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {vcPending ? <Loader2 size={11} className="animate-spin" /> : "Confirm close"}
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {vcMode === "edit" && group.vc && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-elevated/30">
          <div className="rounded-xl border border-line bg-card-solid p-3 space-y-2">
            <p className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">VentureConnect · Edit</p>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Deadline date (ET)</span>
                <input type="date" value={vcEditDate} onChange={(e) => setVcEditDate(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Deadline time (ET)</span>
                <input type="time" value={vcEditTime} onChange={(e) => setVcEditTime(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm font-mono" />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Cycle label</span>
                <input type="text" value={vcCycleLabel} onChange={(e) => setVcCycleLabel(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Note</span>
                <input type="text" value={vcNote} onChange={(e) => setVcNote(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setVcMode("idle")} className="text-xs text-muted hover:text-fg">Cancel</button>
              <button type="button" disabled={vcPending}
                onClick={() => {
                  const iso = vcEditTime === "12:00"
                    ? noonEasternIso(vcEditDate)
                    : new Date(`${vcEditDate}T${vcEditTime}:00-05:00`).toISOString();
                  vcMutate({ action: "update_meta", cycleLabel: vcCycleLabel, note: vcNote, deadlineAt: iso });
                }}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {vcPending ? <Loader2 size={11} className="animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {vcMode === "delete" && group.vc && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-rose-50/60">
          <div className="rounded-xl border border-rose-200 bg-card-solid p-3">
            <p className="text-[10px] font-bold text-brand-700 uppercase tracking-wider mb-1">VentureConnect · Delete</p>
            <p className="text-[11px] text-rose-800 mb-2.5">
              Permanently delete this deadline? The audit log is kept, but auto-sync may recreate it on next page load if it remains in the canonical schedule.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setVcMode("idle")} className="text-xs text-muted hover:text-fg">Cancel</button>
              <button type="button" onClick={vcDel} disabled={vcPending}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                {vcPending ? <Loader2 size={11} className="animate-spin" /> : <><Trash2 size={11} /> Confirm delete</>}
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {/* ── VentureLift action panels ──────────────────────────── */}

      {vlMode === "extend" && group.vl && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-elevated/30">
          <div className="rounded-xl border border-emerald-200 bg-card-solid p-3 space-y-2">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">VentureLift · Extend deadline</p>
            <p className="text-[11px] text-subtle">New deadline (ET). Must be after the current deadline.</p>
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
              <input type="date" value={vlNewDate} onChange={(e) => setVlNewDate(e.target.value)}
                className="bg-card-solid border border-line rounded-lg px-2 py-1.5 text-sm" />
              <input type="time" value={vlNewTime} onChange={(e) => setVlNewTime(e.target.value)}
                className="bg-card-solid border border-line rounded-lg px-2 py-1.5 text-sm font-mono" />
              <button type="button" disabled={vlPending}
                onClick={() => {
                  const iso = vlNewTime === "12:00"
                    ? noonEasternIso(vlNewDate)
                    : new Date(`${vlNewDate}T${vlNewTime}:00-05:00`).toISOString();
                  vlMutate({ action: "extend", deadlineAt: iso });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {vlPending ? <Loader2 size={11} className="animate-spin" /> : "Extend"}
              </button>
              <button type="button" onClick={() => setVlMode("idle")} className="text-xs text-muted hover:text-fg">
                <X size={11} />
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {vlMode === "close" && group.vl && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-elevated/30">
          <div className="rounded-xl border border-line bg-card-solid p-3 space-y-2">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">VentureLift · Close window</p>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Close note (optional)</span>
              <input type="text" value={vlCloseNote} onChange={(e) => setVlCloseNote(e.target.value)}
                placeholder="Reason for early close — applicants see this on /equip"
                className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setVlMode("idle")} className="text-xs text-muted hover:text-fg">Cancel</button>
              <button type="button" disabled={vlPending}
                onClick={() => vlMutate({ action: "close", note: vlCloseNote || undefined })}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {vlPending ? <Loader2 size={11} className="animate-spin" /> : "Confirm close"}
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {vlMode === "edit" && group.vl && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-elevated/30">
          <div className="rounded-xl border border-line bg-card-solid p-3 space-y-2">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">VentureLift · Edit</p>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Deadline date (ET)</span>
                <input type="date" value={vlEditDate} onChange={(e) => setVlEditDate(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Deadline time (ET)</span>
                <input type="time" value={vlEditTime} onChange={(e) => setVlEditTime(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm font-mono" />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Cycle label</span>
                <input type="text" value={vlCycleLabel} onChange={(e) => setVlCycleLabel(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">Note</span>
                <input type="text" value={vlNote} onChange={(e) => setVlNote(e.target.value)}
                  className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-1.5 text-sm" />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setVlMode("idle")} className="text-xs text-muted hover:text-fg">Cancel</button>
              <button type="button" disabled={vlPending}
                onClick={() => {
                  const iso = vlEditTime === "12:00"
                    ? noonEasternIso(vlEditDate)
                    : new Date(`${vlEditDate}T${vlEditTime}:00-05:00`).toISOString();
                  vlMutate({ action: "update_meta", cycleLabel: vlCycleLabel, note: vlNote, deadlineAt: iso });
                }}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                {vlPending ? <Loader2 size={11} className="animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </td></tr>
      )}

      {vlMode === "delete" && group.vl && (
        <tr><td colSpan={3} className="px-5 pb-3 bg-rose-50/60">
          <div className="rounded-xl border border-rose-200 bg-card-solid p-3">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">VentureLift · Delete</p>
            <p className="text-[11px] text-rose-800 mb-2.5">
              Permanently delete this deadline? The audit log is kept, but auto-sync may recreate it on next page load if it remains in the canonical schedule.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setVlMode("idle")} className="text-xs text-muted hover:text-fg">Cancel</button>
              <button type="button" onClick={vlDel} disabled={vlPending}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                {vlPending ? <Loader2 size={11} className="animate-spin" /> : <><Trash2 size={11} /> Confirm delete</>}
              </button>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

function CalendarView({ deadlines, holidaysByDate }: { deadlines: Deadline[]; holidaysByDate: Record<string, { name: string; presidential?: boolean }> }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const acc: Record<string, Deadline[]> = {};
    for (const d of deadlines) {
      const key = new Date(d.deadlineAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
      (acc[key] ?? (acc[key] = [])).push(d);
    }
    return acc;
  }, [deadlines]);

  // Build day grid (always 6 rows × 7 cols = 42 cells)
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(month.getFullYear(), month.getMonth(), d);
    cells.push({ date, key: date.toISOString() });
  }
  while (cells.length < 42) cells.push({ date: null, key: `tail-${cells.length}` });

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <section className="rounded-2xl border border-line bg-card p-5 surface-shadow">
      <header className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-fg">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="text-muted hover:text-fg p-1 rounded-lg hover:bg-elevated"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}
            className="text-xs text-muted hover:text-fg px-2"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="text-muted hover:text-fg p-1 rounded-lg hover:bg-elevated"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider font-bold text-subtle mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (!c.date) return <div key={c.key} className="aspect-square rounded-lg bg-elevated/20" />;
          const key = c.date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
          const rows = byDay[key] ?? [];
          const isToday = c.date.toDateString() === new Date().toDateString();
          const holiday = holidaysByDate[key];
          // Holiday cells get a soft wash so they're visually
          // distinct from working days. Both presidential (U of T
          // internal) and statutory closures fold into amber/rose
          // pairs from the page's 4-colour palette — amber = soft
          // "be aware", rose = harder "stat closed."
          const holidayBg = holiday
            ? (holiday.presidential
              ? "border-amber-200 bg-amber-50/40"
              : "border-rose-200 bg-rose-50/40")
            : "";
          return (
            <div
              key={c.key}
              className={
                "aspect-square rounded-lg border p-1.5 flex flex-col gap-0.5 " +
                (isToday
                  ? "border-brand-500 bg-brand-50/40"
                  : holiday
                    ? holidayBg
                    : "border-line bg-card-solid")
              }
              title={holiday ? holiday.name : undefined}
            >
              <span className={"text-[13px] font-black leading-none tabular-nums " + (isToday ? "text-brand-700" : holiday ? (holiday.presidential ? "text-amber-800" : "text-rose-700") : "text-fg")}>
                {c.date.getDate()}
              </span>
              {holiday && (
                <span className={"text-[9px] uppercase tracking-wider font-bold truncate " + (holiday.presidential ? "text-amber-800/80" : "text-rose-700/70")}>
                  {holiday.name}
                </span>
              )}
              {rows.slice(0, 2).map((r) => {
                const meta = STREAM_META[r.stream] ?? { label: r.stream, tone: "brand" as const, cap: "" };
                return (
                  <span
                    key={r.id}
                    // Calendar-cell deadline label — flat hairline
                    // accent on the left edge in the role colour, no
                    // filled chip. Closed deadlines retain the line-
                    // through; otherwise the colour comes from text
                    // tone only.
                    className={
                      "text-[10px] font-semibold px-1 py-0.5 truncate border-l-2 " +
                      (r.status === "closed"
                        ? "border-rose-400 text-rose-700 line-through"
                        : meta.tone === "success"
                          ? "border-emerald-600 text-emerald-700"
                          : "border-brand-500 text-brand-700")
                    }
                    title={`${meta.label} · ${r.cycleLabel ?? ""}`}
                  >
                    {meta.label}
                  </span>
                );
              })}
              {rows.length > 2 && (
                <span className="text-[10px] text-subtle">+{rows.length - 2} more</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-subtle mt-3">
        Click <strong>List</strong> tab to add / edit / close individual deadlines. Calendar view is read-only for now.
      </p>
    </section>
  );
}

