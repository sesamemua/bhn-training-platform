"use client";

/**
 * The Admin tab: decision model, capacity dashboard, registrants, email.
 *
 * Four sections rather than four pages, because they are one job. You
 * change a rule to see who it moves, notice a room is 4 over, raise its
 * capacity, then write to the people it just let in — and a navigation
 * between each of those is four chances to lose your place.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, Eye, FileText, Loader2, Mail,
  Plus, RotateCcw, Trash2, Users,
} from "lucide-react";
import {
  DEFAULT_RULES, RULE_KINDS, rankApplicants, validateRules,
  type Applicant, type Rule, type RuleKind,
} from "@/lib/allocation/model";
import {
  createWorkshop, deleteSubmission, loadEmailTemplates, loadSubmissions, previewAudience,
  removeWorkshop, resetEmailTemplate, saveEmailTemplate, saveRules, saveSupportFormUrl,
  sendToAudience, updateWorkshop,
} from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import type { Audience, SubmissionRow } from "@/lib/allocation/admin-types";
import {
  BODY_MAX, fieldsUsed, MERGE_FIELDS, needsOneSession, refusesMultiSession, render,
  STAGE_LABELS, STAGES, SUBJECT_MAX, unfilledGlobals, type ResolvedTemplate, type Stage,
} from "@/lib/allocation/email-templates";
import { CONFIRM_DAYS_BEFORE } from "@/lib/formbuilder/training-week";
import { idOf, label, place, timeGrid, titleOf } from "@/lib/allocation/schedule";
import { DAYS, LEARNING_PATHS, SHARED } from "@/lib/training-week/schedule-2026";

export interface AdminBooking {
  id: string;
  status: string;
  bookedAt: string;
  /** When an admin approved it. Null on rows that never needed it. */
  approvedAt: string | null;
  waitlistPosition: number | null;
  user: { id: string; name: string | null; email: string; organization: string | null; country: string | null } | null;
}
export interface AdminWorkshop {
  id: string; slug: string; title: string; kind: string;
  capacity: number; waitlistCapacity: number;
  requiresApproval: boolean; isActive: boolean;
  startDateTime: string; endDateTime: string;
  locationName: string | null; partnerOrganization: string | null;
  shortDescription: string | null;
  bookings: AdminBooking[];
}

type Tab = "dashboard" | "model" | "capacity" | "registrants" | "email";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "model", label: "Decision model" },
  { id: "capacity", label: "Capacity" },
  { id: "registrants", label: "Registrants" },
  { id: "email", label: "Email" },
];

const CARD = "rounded-lg border border-line bg-card p-4";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.12em] text-subtle";
const LINE =
  "mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg outline-none focus-visible:border-brand-500";
const BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";
const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white hover:brightness-110 disabled:opacity-40";

/**
 * Out of town, from the only location the account carries.
 *
 * `undefined` where the country is blank — unknown is not the same as
 * local, and a rule that treats every blank field as "lives here" hands
 * seats to whoever filled their profile in.
 */
const outOfTown = (country: string | null | undefined): boolean | undefined => {
  if (!country || !country.trim()) return undefined;
  return country.trim().toLowerCase() !== "canada";
};

/**
 * The five numbers for one workshop, in the order the organisers read
 * them: approved, confirmed, confirmed by the cut-off, waitlisted, and
 * what the room actually holds.
 *
 * `byCutOff` is confirmed AND approved on or before the cut-off, which
 * is the closest the data supports: the platform records when an ADMIN
 * approved a booking, not when the registrant themselves confirmed. The
 * column says what it measures rather than implying the other thing.
 */
// One number for the deadline the process uses and the deadline the
// reporting measures against — two would drift the first time either
// changed.
const CUT_OFF_DAYS = CONFIRM_DAYS_BEFORE;

export function countsOf(w: AdminWorkshop) {
  const live = w.bookings.filter((b) => b.status !== "cancelled");
  const cutOff = new Date(w.startDateTime).getTime() - CUT_OFF_DAYS * 86400_000;
  const confirmed = live.filter((b) => b.status === "confirmed");
  return {
    approved: live.filter((b) => b.approvedAt).length,
    confirmed: confirmed.length,
    byCutOff: confirmed.filter((b) => b.approvedAt && new Date(b.approvedAt).getTime() <= cutOff).length,
    waitlisted: live.filter((b) => b.status === "waitlist").length,
    capacity: w.capacity,
  };
}

const seatsOf = (w: AdminWorkshop) => w.bookings.filter((b) => b.status === "confirmed").length;
const waitOf = (w: AdminWorkshop) => w.bookings.filter((b) => b.status === "waitlist").length;
const pendingOf = (w: AdminWorkshop) => w.bookings.filter((b) => b.status === "pending").length;

export function TrainingAdmin({
  eventId, eventTitle, rules: initialRules, workshops,
}: {
  eventId: string; eventTitle: string; rules: Rule[]; workshops: AdminWorkshop[];
}) {
  // Opens on the dashboard: the first question anybody has here is
  // "how is it going", not "let me change the policy".
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="mt-6">
      <p className="text-[12.5px] text-muted">{eventTitle}</p>
      <nav className="mt-3 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.id
                ? "border-brand-500 text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "dashboard" && (
          <Dashboard rules={initialRules} workshops={workshops} onOpen={setTab} />
        )}
        {tab === "model" && <DecisionModel initial={initialRules} workshops={workshops} />}
        {tab === "capacity" && <Capacity eventId={eventId} workshops={workshops} />}
        {tab === "registrants" && <Registrants workshops={workshops} />}
        {tab === "email" && <EmailSection eventId={eventId} workshops={workshops} />}
      </div>
    </div>
  );
}

// ── dashboard ────────────────────────────────────────────────────────

/**
 * What an organiser wants on opening the tab: how the week is filling,
 * what the policy currently is, and when everything happens.
 *
 * Read-only on purpose. Every number here is a door into the panel that
 * can change it, so the landing page never has to be the place where
 * something is edited by accident.
 */
function Dashboard({
  rules, workshops, onOpen,
}: { rules: Rule[]; workshops: AdminWorkshop[]; onOpen: (t: Tab) => void }) {
  const live = workshops.filter((w) => w.isActive);
  const active = rules.filter((r) => r.isActive);
  const totals = live.reduce(
    (acc, w) => {
      const c = countsOf(w);
      return {
        approved: acc.approved + c.approved,
        confirmed: acc.confirmed + c.confirmed,
        byCutOff: acc.byCutOff + c.byCutOff,
        waitlisted: acc.waitlisted + c.waitlisted,
        capacity: acc.capacity + c.capacity,
      };
    },
    { approved: 0, confirmed: 0, byCutOff: 0, waitlisted: 0, capacity: 0 },
  );

  return (
    <div className="space-y-5">
      {/* The policy, in two lines, with a way in. */}
      <section className={`${CARD} max-w-2xl`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={LABEL}>Decision model</p>
          <button
            onClick={() => onOpen("model")}
            className="text-[12px] font-semibold text-brand-400 hover:text-brand-200"
          >
            Open the decision model →
          </button>
        </div>
        {active.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-amber-600">
            Every rule is switched off — nothing would decide an oversubscribed room.
          </p>
        ) : (
          <>
            <ol className="mt-2 space-y-1">
              {active.map((r, i) => (
                <li key={r.id} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className="w-10 shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-subtle">
                    {i === 0 ? "First" : i === 1 ? "Second" : `Then`}
                  </span>
                  <span className="text-fg">{r.label}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11.5px] leading-snug text-subtle">
              When a room is oversubscribed, that order decides who gets a seat.
              {rules.length > active.length ? ` ${rules.length - active.length} rule switched off.` : ""}
            </p>
          </>
        )}
      </section>

      {/* Every room, and the five numbers. */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <p className={LABEL}>Seats</p>
          <button
            onClick={() => onOpen("capacity")}
            className="text-[12px] font-semibold text-brand-400 hover:text-brand-200"
          >
            Change capacity →
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-elevated text-left">
                <th className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-subtle">Workshop</th>
                {["Approved", "Confirmed", "By cut-off", "Waitlisted", "Capacity"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide text-subtle">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {live.map((w) => {
                const c = countsOf(w);
                const over = c.confirmed > c.capacity;
                return (
                  <tr key={w.id} className="border-t border-line">
                    <td className="px-3 py-1.5">
                      <span className="text-fg">{w.title}</span>
                      <span className="ml-2 text-[11px] text-subtle">
                        {new Date(w.startDateTime).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{c.approved}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${over ? "font-bold text-red-500" : "text-fg"}`}>{c.confirmed}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{c.byCutOff}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{c.waitlisted}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-subtle">{c.capacity}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line bg-elevated/50 font-semibold">
                <td className="px-3 py-1.5 text-subtle">All {live.length} sessions</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{totals.approved}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-fg">{totals.confirmed}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{totals.byCutOff}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{totals.waitlisted}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-subtle">{totals.capacity}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 max-w-prose text-[11px] leading-snug text-subtle">
          <strong>By cut-off</strong> counts confirmed seats approved at least {CUT_OFF_DAYS} days
          before the session. It reads when an ADMIN approved the booking — the platform does not yet
          record the moment a registrant confirms for themselves, so this is the closest the data
          supports rather than a separate answer.
        </p>
      </section>

      <Calendar workshops={live} />
    </div>
  );
}

/**
 * The week as a time grid: hours down the side, a column per day.
 *
 * It used to be three lists under three headings, which says what is on
 * each day and nothing about when. Two tours at the same hour and a tour
 * that runs all afternoon looked the same, and telling them apart is the
 * only reason to draw a calendar rather than a table.
 *
 * All three days share one vertical scale, so 1pm on Monday is level
 * with 1pm on Wednesday and a clash is a shape rather than something you
 * work out from two timestamps.
 */
function Calendar({ workshops }: { workshops: AdminWorkshop[] }) {
  // The shared items only widen the grid — they are drawn behind the
  // sessions rather than beside them, because nobody books a lunch.
  const grid = useMemo(() => timeGrid(workshops, SHARED), [workshops]);
  const byId = useMemo(() => new Map(workshops.map((w) => [w.id, w])), [workshops]);
  const themeOf = (day: string) => DAYS.find((d) => d.date === day);
  const offset = (m: number) => `${((m - grid.startMin) / (grid.endMin - grid.startMin)) * 100}%`;
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  // Tall enough that an hour is a comfortable band, short enough that
  // three days fit on a screen without scrolling.
  const HOUR_PX = 56;
  const height = ((grid.endMin - grid.startMin) / 60) * HOUR_PX;

  if (grid.days.length === 0) {
    return (
      <section>
        <p className={LABEL}>Calendar</p>
        <p className="mt-2 text-[12.5px] text-muted">No sessions scheduled.</p>
      </section>
    );
  }

  return (
    <section>
      <p className={LABEL}>Calendar</p>
      <div className="mt-2 overflow-x-auto rounded-xl border-2 border-line-strong bg-card p-3">
        <div className="flex min-w-[560px] gap-2">
          {/* The time scale. Labels sit ON the hour line rather than in
              the band below it, so a session starting at 11:00 has its
              top edge against the 11:00 label. */}
          <div className="relative w-12 shrink-0" style={{ height }}>
            {grid.hours.map((m) => (
              <span
                key={m}
                className="absolute right-1 -translate-y-1/2 font-mono text-[10.5px] text-subtle"
                style={{ top: `${((m - grid.startMin) / (grid.endMin - grid.startMin)) * 100}%` }}
              >
                {label(m)}
              </span>
            ))}
          </div>

          {grid.days.map(({ day, slots }) => (
            <div key={day} className="min-w-0 flex-1">
              <p className="text-center text-[11px] font-bold uppercase tracking-wide text-subtle">
                {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short", day: "numeric", month: "short",
                })}
              </p>
              {/* The programme the day belongs to. It is how the
                  coordinators talk about the week, and without it the
                  columns are three anonymous dates. */}
              <p className="truncate pb-1.5 text-center text-[10px] text-muted" title={themeOf(day)?.theme}>
                {themeOf(day)?.theme ?? ""}
              </p>
              <div className="relative rounded-lg border border-line bg-elevated/40" style={{ height }}>
                {/* Hour rules, drawn on every column so the eye can carry
                    a time across the week. */}
                {grid.hours.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: `${((m - grid.startMin) / (grid.endMin - grid.startMin)) * 100}%` }}
                  />
                ))}

                {/* Everyone-on-the-day items: drawn first, so they sit
                    behind the sessions and read as background rather
                    than as something with seats. */}
                {SHARED.filter((x) => x.day === day).map((x) => (
                  <div
                    key={x.slug}
                    title={`${x.title} · ${x.start}–${x.end}${x.note ? ` · ${x.note}` : ""}`}
                    className="absolute inset-x-0 overflow-hidden rounded-md border border-dashed border-line-strong bg-elevated px-1.5 py-0.5"
                    style={{
                      top: offset(minutes(x.start)),
                      height: `${((minutes(x.end) - minutes(x.start)) / (grid.endMin - grid.startMin)) * 100}%`,
                    }}
                  >
                    <p className="truncate text-[10px] text-muted">{x.title}</p>
                  </div>
                ))}

                {slots.map((sl) => {
                  const w = byId.get(idOf(sl.option));
                  if (!w) return null;
                  const c = countsOf(w);
                  const pos = place(sl, grid);
                  const full = c.confirmed >= c.capacity && c.capacity > 0;
                  return (
                    <div
                      key={sl.option}
                      title={`${titleOf(sl.option)} · ${sl.start}–${sl.end}${w.locationName ? ` · ${w.locationName}` : ""}`}
                      className={`absolute overflow-hidden rounded-md border px-1.5 py-1 ${
                        full ? "border-amber-500/70 bg-amber-500/12" : "border-brand-500/60 bg-brand-500/12"
                      }`}
                      style={{
                        top: `${pos.top}%`,
                        height: `${pos.height}%`,
                        // Side by side when they clash, full width when
                        // nothing is competing for the hour.
                        left: `${(sl.lane / sl.lanes) * 100}%`,
                        width: `calc(${100 / sl.lanes}% - 2px)`,
                      }}
                    >
                      <p className="truncate text-[10.5px] font-mono text-subtle">{sl.start}</p>
                      <p className="text-[11px] font-semibold leading-tight text-fg line-clamp-2">
                        {titleOf(sl.option)}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {c.confirmed}/{c.capacity}
                        {c.waitlisted > 0 ? ` · ${c.waitlisted} wait` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Courses that run alongside the week rather than at an hour on
          it. No seats and no clash, so they belong under the grid
          rather than in it — but leaving them out entirely makes the
          week look emptier than it is. */}
      {LEARNING_PATHS.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-elevated/40">
          {LEARNING_PATHS.map((lp) => (
            <li key={lp.title} className="flex flex-wrap items-baseline gap-x-2 px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-fg">{lp.title}</span>
              <span className="font-mono text-[10px] text-subtle">
                {lp.days.map((d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })).join(" · ")}
              </span>
              {lp.note && <span className="text-[10.5px] text-muted">{lp.note}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-subtle">
        All three days share one scale, so sessions level with each other run
        at the same time. Amber means the room is full. Dashed blocks are for
        everyone on the day and are not booked.
      </p>
    </section>
  );
}

// ── decision model ───────────────────────────────────────────────────

function DecisionModel({ initial, workshops }: { initial: Rule[]; workshops: AdminWorkshop[] }) {
  const [rules, setRules] = useState<Rule[]>(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const verdict = validateRules(rules);

  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= rules.length) return;
    const next = [...rules];
    [next[i], next[to]] = [next[to], next[i]];
    setRules(next);
    setSaved(null);
  };
  const patch = (i: number, p: Partial<Rule>) => {
    setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
    setSaved(null);
  };
  const add = (kind: RuleKind) => {
    setRules([
      ...rules.filter((r) => r.kind !== "first_come"),
      { id: `r-${kind}-${rules.length}`, kind, label: RULE_KINDS[kind].label, isActive: true },
      ...rules.filter((r) => r.kind === "first_come"),
    ]);
    setSaved(null);
  };

  const unused = (Object.keys(RULE_KINDS) as RuleKind[]).filter(
    (k) => !rules.some((r) => r.kind === k),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <p className="max-w-prose text-[12.5px] leading-relaxed text-muted">
          When a room is oversubscribed, these rules decide the order. The
          first rule that can tell two applicants apart decides between
          them; equal on that, the next rule is asked. The bottom rule has
          to be one that can never tie, or two people end up ordered by
          nothing you could explain to either of them.
        </p>

        <ol className="mt-4 space-y-2">
          {rules.map((r, i) => {
            const info = RULE_KINDS[r.kind];
            return (
              <li key={r.id} className={`${CARD} ${r.isActive ? "" : "opacity-55"}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-bold text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      value={r.label}
                      onChange={(e) => patch(i, { label: e.target.value.slice(0, 60) })}
                      className="w-full border-0 bg-transparent p-0 text-[13.5px] font-semibold text-fg outline-none focus-visible:text-brand-300"
                    />
                    <p className="mt-1 text-[11.5px] leading-snug text-muted">{info.blurb}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-subtle">
                      Trade-off: {info.caution}
                    </p>
                    {r.kind === "out_of_town" && (
                      <label className="mt-2 inline-flex items-center gap-2 text-[11.5px] text-muted">
                        Counts as out of town from
                        <input
                          type="number"
                          min={1}
                          value={r.config?.minKm ?? 50}
                          onChange={(e) =>
                            patch(i, { config: { ...r.config, minKm: Number(e.target.value) || 1 } })
                          }
                          className="w-16 rounded border border-line bg-elevated px-1.5 py-0.5 text-[12px] text-fg"
                        />
                        km
                      </label>
                    )}
                    {r.kind === "out_of_town" && (
                      <p className="mt-1 text-[11px] leading-snug text-subtle">
                        Until the registration form carries a travel origin
                        through, this reads the country on the account, and
                        the distance above has nothing to measure.
                      </p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} title="Higher priority" className="rounded p-1 text-subtle hover:bg-elevated hover:text-fg disabled:opacity-25">
                      <ArrowUp size={13} />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === rules.length - 1} title="Lower priority" className="rounded p-1 text-subtle hover:bg-elevated hover:text-fg disabled:opacity-25">
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => patch(i, { isActive: !r.isActive })}
                      title={r.isActive ? "Switch this rule off" : "Switch this rule on"}
                      className={`rounded px-1.5 py-1 text-[10.5px] font-bold ${r.isActive ? "text-emerald-500" : "text-subtle"}`}
                    >
                      {r.isActive ? "ON" : "OFF"}
                    </button>
                    <button
                      onClick={() => { setRules(rules.filter((_, j) => j !== i)); setSaved(null); }}
                      title="Remove this rule"
                      className="rounded p-1 text-subtle hover:bg-elevated hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        {unused.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unused.map((k) => (
              <button key={k} onClick={() => add(k)} className={BTN} title={RULE_KINDS[k].blurb}>
                <Plus size={12} /> {RULE_KINDS[k].label}
              </button>
            ))}
          </div>
        )}

        {!verdict.ok && (
          <p className="mt-4 inline-flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-[12.5px] text-amber-600">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {verdict.problem}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            className={PRIMARY}
            disabled={!verdict.ok || pending}
            onClick={() =>
              start(async () => {
                const res = await saveRules(rules);
                setSaved(res.ok ? "Saved." : res.problem ?? "Could not save.");
              })
            }
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save the model
          </button>
          <button className={BTN} onClick={() => { setRules(DEFAULT_RULES); setSaved(null); }}>
            Reset to the shipped policy
          </button>
          {saved && <span className="text-[12.5px] text-muted">{saved}</span>}
        </div>
      </div>

      <RankPreview rules={rules} workshops={workshops} />
    </div>
  );
}

/**
 * The rules run against real bookings.
 *
 * A rule list is an abstraction until you see who it moves; this is the
 * difference between editing a policy and guessing at one.
 */
function RankPreview({ rules, workshops }: { rules: Rule[]; workshops: AdminWorkshop[] }) {
  const busiest = useMemo(
    () => [...workshops].sort((a, b) => b.bookings.length - a.bookings.length)[0] ?? null,
    [workshops],
  );

  const ranked = useMemo(() => {
    if (!busiest) return [];
    // Seats held across the WHOLE week, not just this room — the rule
    // is about how much of the week one person is taking.
    const heldBy = new Map<string, number>();
    for (const w of workshops)
      for (const bk of w.bookings)
        if (bk.user && bk.status !== "cancelled")
          heldBy.set(bk.user.id, (heldBy.get(bk.user.id) ?? 0) + 1);

    const applicants: Applicant[] = busiest.bookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        name: b.user?.name || b.user?.email || "Unnamed",
        appliedAt: b.bookedAt,
        // Every field the rules can read is supplied, or the rule that
        // reads it silently ranks nobody — three of the five kinds used
        // to be unable to move a single person in the one place the
        // model is ever seen running.
        isOutOfTown: outOfTown(b.user?.country),
        isCurrentTrainee: b.status === "confirmed",
        organizationType: b.user?.organization ?? null,
        seatsHeld: b.user ? heldBy.get(b.user.id) ?? 0 : 0,
      }));
    return rankApplicants(applicants, rules, busiest.capacity);
  }, [busiest, rules, workshops]);

  // Which active rules have no field to read across this audience.
  const starved = useMemo(() => {
    if (!busiest) return [];
    const rows = busiest.bookings.filter((b) => b.status !== "cancelled");
    const none = (f: (b: (typeof rows)[number]) => unknown) => rows.length > 0 && rows.every((b) => !f(b));
    return rules
      .filter((r) => r.isActive)
      .filter((r) =>
        r.kind === "out_of_town"
          ? none((b) => b.user?.country)
          : r.kind === "under_represented_org"
            ? none((b) => b.user?.organization)
            : false,
      )
      .map((r) => r.label);
  }, [busiest, rules]);

  if (!busiest) {
    return (
      <aside className={CARD}>
        <p className={LABEL}>Preview</p>
        <p className="mt-2 text-[12.5px] text-muted">No workshops to rank yet.</p>
      </aside>
    );
  }

  return (
    <aside className={`${CARD} lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-auto`}>
      <p className={LABEL}>Preview · {busiest.title}</p>
      <p className="mt-1 text-[11.5px] text-subtle">
        {ranked.length} applicants, {busiest.capacity} seats. Reorder the rules
        and this reorders with them.
      </p>
      {/* A rule with no data to read ranks nobody, and silently. Better
          to say which ones those are than to let an admin promote a rule
          to the top and conclude the model is broken. */}
      {starved.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-600">
          Nothing to rank on yet for: {starved.join(", ")}. These change no
          order until the registration form carries that answer through.
        </p>
      )}
      {ranked.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">Nobody has booked this one yet.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {ranked.slice(0, 25).map((r) => (
            <li key={r.applicant.id} className="flex items-baseline gap-2 text-[12px]">
              <span className="w-5 shrink-0 text-right font-mono text-subtle">{r.position}</span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  r.outcome === "seat" ? "bg-emerald-500/12 text-emerald-500" : "bg-amber-500/12 text-amber-500"
                }`}
              >
                {r.outcome === "seat" ? "seat" : "wait"}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">{r.applicant.name}</span>
              {r.decidedBy && (
                <span className="shrink-0 truncate text-[10.5px] text-subtle" title={`Placed above the next person by: ${r.decidedBy}`}>
                  {r.decidedBy}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

// ── capacity ─────────────────────────────────────────────────────────

function Capacity({ eventId, workshops }: { eventId: string; workshops: AdminWorkshop[] }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  // A refused write has to say so. Showing 40 in a box the database
  // never accepted is worse than showing 20, because the admin walks
  // away believing the room is bigger than it is.
  const [problem, setProblem] = useState<string | null>(null);

  const commit = (id: string, patch: Parameters<typeof updateWorkshop>[1], revert: () => void) =>
    start(async () => {
      const res = await updateWorkshop(id, patch).catch(() => ({ ok: false as const, problem: "Could not save — you may have been signed out." }));
      if (!res.ok) { setProblem(res.problem ?? "Could not save."); revert(); }
      else setProblem(null);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-[12.5px] leading-relaxed text-muted">
          Seats taken against seats available, per room. Change a number and it
          saves when you leave the field.
        </p>
        <button className={BTN} onClick={() => setAdding((v) => !v)}>
          <Plus size={12} /> Add a workshop
        </button>
      </div>

      {problem && (
        <p className="mt-3 inline-flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5 text-[12.5px] text-amber-600">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {problem}
        </p>
      )}

      {adding && <NewWorkshop eventId={eventId} onDone={() => setAdding(false)} />}

      <ul className="mt-4 space-y-2">
        {workshops.map((w) => {
          const seats = seatsOf(w);
          const over = seats > w.capacity;
          const pct = w.capacity > 0 ? Math.min(100, (seats / w.capacity) * 100) : 0;
          return (
            <li key={w.id} className={`${CARD} ${w.isActive ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-fg">
                    {w.title}
                    {!w.isActive && <span className="ml-2 text-[11px] text-subtle">retired</span>}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-subtle">
                    {new Date(w.startDateTime).toLocaleString()} · {w.kind}
                    {w.locationName ? ` · ${w.locationName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-end gap-3">
                  <NumberField
                    label="Seats"
                    value={w.capacity}
                    onCommit={(v, revert) => commit(w.id, { capacity: v }, revert)}
                  />
                  <NumberField
                    label="Waitlist"
                    value={w.waitlistCapacity}
                    onCommit={(v, revert) => commit(w.id, { waitlistCapacity: v }, revert)}
                  />
                  {/* Two steps. The trash icon sits next to the Waitlist
                      field, and a single unconfirmed click on it used to
                      permanently delete a workshop that had no bookings
                      yet — the one case where there is nothing to undo
                      it from. */}
                  {armed === w.id ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-500">
                      {w.bookings.length
                        ? `Retire? ${w.bookings.length} booking${w.bookings.length === 1 ? "" : "s"} kept`
                        : "Delete for good?"}
                      <button
                        className="font-bold underline"
                        onClick={() => start(async () => { await removeWorkshop(w.id); setArmed(null); })}
                      >
                        Yes
                      </button>
                      <button className="underline" onClick={() => setArmed(null)}>No</button>
                    </span>
                  ) : (
                    <button
                      className="rounded p-1.5 text-subtle hover:bg-elevated hover:text-red-500"
                      title={w.bookings.length ? "Retire this workshop (it has bookings)" : "Delete this workshop"}
                      onClick={() => setArmed(w.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated">
                  <div
                    className={`h-full rounded-full ${over ? "bg-red-500" : pct >= 100 ? "bg-amber-500" : "bg-brand-500"}`}
                    style={{ width: `${Math.max(pct, seats > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <p className={`shrink-0 text-[12px] ${over ? "font-bold text-red-500" : "text-muted"}`}>
                  {seats}/{w.capacity} seats
                  {over && ` · ${seats - w.capacity} over`}
                  {waitOf(w) > 0 && ` · ${waitOf(w)} waiting`}
                  {pendingOf(w) > 0 && ` · ${pendingOf(w)} to approve`}
                </p>
              </div>
              {pending && <span className="sr-only">Saving</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A number that saves on blur rather than on every keystroke. */
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number, revert: () => void) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wide text-subtle">{label}</span>
      <input
        type="number"
        min={0}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n, () => setV(String(value)));
          else setV(String(value));
        }}
        className="mt-0.5 w-20 rounded-md border border-line bg-elevated px-2 py-1 text-[13px] text-fg outline-none focus-visible:border-brand-500"
      />
    </label>
  );
}

function NewWorkshop({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "", kind: "workshop", startDateTime: "", endDateTime: "",
    capacity: 20, waitlistCapacity: 5, locationName: "", partnerOrganization: "",
    shortDescription: "", requiresApproval: true, isActive: true,
  });
  const ready = f.title.trim() && f.startDateTime && f.endDateTime;

  return (
    <div className={`${CARD} mt-4`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={LABEL}>Title</span>
          <input className={LINE} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label><span className={LABEL}>Kind</span>
          <select className={LINE} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="workshop">workshop</option><option value="tour">tour</option><option value="bootcamp">bootcamp</option>
          </select></label>
        <label><span className={LABEL}>Where</span>
          <input className={LINE} value={f.locationName} onChange={(e) => setF({ ...f, locationName: e.target.value })} /></label>
        <label><span className={LABEL}>Starts</span>
          <input type="datetime-local" className={LINE} value={f.startDateTime} onChange={(e) => setF({ ...f, startDateTime: e.target.value })} /></label>
        <label><span className={LABEL}>Ends</span>
          <input type="datetime-local" className={LINE} value={f.endDateTime} onChange={(e) => setF({ ...f, endDateTime: e.target.value })} /></label>
        <label><span className={LABEL}>Seats</span>
          <input type="number" min={0} className={LINE} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></label>
        <label><span className={LABEL}>Waitlist</span>
          <input type="number" min={0} className={LINE} value={f.waitlistCapacity} onChange={(e) => setF({ ...f, waitlistCapacity: Number(e.target.value) })} /></label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          className={PRIMARY}
          disabled={!ready || pending}
          onClick={() =>
            start(async () => {
              // A datetime-local value carries no zone. Sent as-is, the
              // server reads "2026-09-15T09:00" in ITS timezone — UTC on
              // Vercel — and a 9am Toronto tour is stored as 9am UTC,
              // which is 5am to everyone who reads it back. Stamping the
              // browser's offset here is what makes the two agree.
              const stamp = (v: string) => (v ? new Date(v).toISOString() : v);
              const res = await createWorkshop(eventId, {
                ...f,
                startDateTime: stamp(f.startDateTime),
                endDateTime: stamp(f.endDateTime),
              });
              if (res.ok) onDone();
              else setProblem(res.problem ?? "Could not create it.");
            })
          }
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
        </button>
        <button className={BTN} onClick={onDone}>Cancel</button>
        {problem && <span className="text-[12.5px] text-amber-600">{problem}</span>}
      </div>
    </div>
  );
}

// ── registrants ──────────────────────────────────────────────────────

/**
 * What people have sent in, before anybody has done anything about it.
 *
 * The table below this one is BOOKINGS — seats we have given out. Until
 * a coordinator approves somebody there are none, so a registrant sheet
 * that only reads bookings is empty exactly when the work is piling up.
 * A submission is what somebody said; a booking is what we did about it.
 */
function Submissions() {
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = () => { start(async () => setRows(await loadSubmissions())); };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tests = (rows ?? []).filter((r) => r.isTest).length;

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={LABEL}>Submitted registrations</p>
        <span className="text-[11.5px] text-subtle">
          {rows === null ? "Loading…" : `${rows.length} in total${tests ? ` · ${tests} test` : ""}`}
        </span>
      </div>

      {rows !== null && rows.length === 0 && (
        <p className="mt-2 rounded-lg border border-line bg-elevated/40 p-3 text-[12.5px] leading-relaxed text-muted">
          Nothing yet. Open <span className="font-semibold text-fg">2026 Symposium → Registration Form</span>,
          switch to <span className="font-semibold text-fg">Preview</span> and submit it — the entry lands here,
          marked as a test, and you can delete it from this table.
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                aria-expanded={openId === r.id}
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-elevated/50"
              >
                <ChevronDown size={14} className={`mt-0.5 shrink-0 text-subtle transition-transform ${openId === r.id ? "rotate-180" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-fg">{r.name || r.email || "No name given"}</span>
                    {r.isTest && (
                      <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-600">test</span>
                    )}
                    <span className="font-mono text-[11px] text-subtle">
                      {new Date(r.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                    {r.email}{r.status ? ` · ${r.status}` : ""}
                  </span>
                  {r.sessions.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {r.sessions.map((sess, i) => (
                        <span key={sess} className="inline-flex items-center gap-1 rounded border border-line bg-elevated px-1.5 py-0.5 text-[10.5px] text-muted">
                          <span className="font-bold text-brand-500">{i + 1}</span>
                          {sess.split(" · ").pop()}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>

              {openId === r.id && (
                <div className="border-t border-line bg-elevated/30 px-3.5 py-3">
                  <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,220px)_1fr]">
                    {Object.entries(r.answers).map(([q, a]) => (
                      <div key={q} className="contents">
                        <dt className="text-[11.5px] font-semibold text-subtle">{q}</dt>
                        <dd className="text-[12.5px] text-fg">{a || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:border-red-500/50 hover:text-red-500 disabled:opacity-40"
                    disabled={pending}
                    onClick={() => start(async () => { await deleteSubmission(r.id); reload(); })}
                  >
                    <Trash2 size={12} /> Delete this {r.isTest ? "test " : ""}submission
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Registrants({ workshops }: { workshops: AdminWorkshop[] }) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const all = workshops.flatMap((w) =>
      w.bookings.map((b) => ({
        workshop: w.title,
        name: b.user?.name ?? "",
        email: b.user?.email ?? "",
        organization: b.user?.organization ?? "",
        country: b.user?.country ?? "",
        status: b.status,
        position: b.waitlistPosition,
        bookedAt: b.bookedAt,
      })),
    );
    const q = filter.trim().toLowerCase();
    return q
      ? all.filter((r) =>
          [r.workshop, r.name, r.email, r.organization, r.status].join(" ").toLowerCase().includes(q),
        )
      : all;
  }, [workshops, filter]);

  const csv = useMemo(() => {
    const head = ["Workshop", "Name", "Email", "Organization", "Country", "Status", "Waitlist #", "Booked"];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return [head, ...rows.map((r) => [r.workshop, r.name, r.email, r.organization, r.country, r.status, r.position ?? "", r.bookedAt])]
      .map((line) => line.map((c) => esc(String(c))).join(","))
      .join("\n");
  }, [rows]);

  return (
    <>
      <Submissions />
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, email, organisation, workshop, status"
          className="w-full max-w-md rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-subtle focus-visible:border-brand-500"
        />
        <p className="text-[12.5px] text-muted">{rows.length} rows</p>
      </div>

      {/* Wide, so it scrolls in its own box rather than the page. */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[840px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-elevated text-left">
              {["Workshop", "Name", "Email", "Organisation", "Country", "Status", "#", "Booked"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-subtle">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-1.5 text-muted">{r.workshop}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-fg">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px] text-muted">{r.email}</td>
                <td className="px-3 py-1.5 text-muted">{r.organization}</td>
                <td className="px-3 py-1.5 text-muted">{r.country}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                    r.status === "confirmed" ? "bg-emerald-500/12 text-emerald-500"
                    : r.status === "waitlist" ? "bg-amber-500/12 text-amber-500"
                    : r.status === "pending" ? "bg-brand-500/12 text-brand-400"
                    : "bg-elevated text-subtle"}`}>{r.status}</span>
                </td>
                <td className="px-3 py-1.5 text-muted">{r.position ?? ""}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-subtle">{new Date(r.bookedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">Nothing matches that.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] text-muted hover:text-fg">
          <ChevronDown size={12} className="inline" /> Copy as CSV
        </summary>
        {/* A textarea rather than a download: the viewer sandbox blocks
            page-initiated downloads, and select-all-copy always works. */}
        <textarea
          readOnly
          value={csv}
          rows={6}
          className="mt-2 w-full rounded-md border border-line bg-elevated p-2 font-mono text-[11px] text-muted"
        />
      </details>
    </div>
    </>
  );
}

// ── email ────────────────────────────────────────────────────────────

/**
 * The letters, and the editor for them.
 *
 * Email is two different jobs sharing a tab. One is "write to these
 * forty people now"; the other is "the wording we use when somebody is
 * declined" — which is a decision, not a message, and it wants to be
 * settled once when nobody is under pressure rather than improvised in
 * the moment somebody has to send it.
 */
function EmailSection({ eventId, workshops }: { eventId: string; workshops: AdminWorkshop[] }) {
  const [half, setHalf] = useState<"compose" | "templates">("compose");
  const [bundle, setBundle] = useState<{ templates: ResolvedTemplate[]; supportFormUrl: string } | null>(null);
  const [loading, startLoad] = useTransition();

  // Wrapped rather than passed straight to useEffect: startTransition
  // returns void today, but an effect callback's return value is read as
  // a cleanup function and that is not a thing to leave to luck.
  const reload = () => { startLoad(async () => setBundle(await loadEmailTemplates())); };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-line bg-elevated p-0.5">
        {([["compose", "Write one now", Mail], ["templates", "Standing letters", FileText]] as const).map(([id, text, Icon]) => (
          <button
            key={id}
            aria-pressed={half === id}
            onClick={() => setHalf(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              half === id ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Icon size={13} /> {text}
          </button>
        ))}
      </div>

      {/* Both rendered, one hidden — not a ternary.
          Compose holds the half-written message in local state, and the
          tab's own help text tells you to go and look at Standing
          letters, so unmounting it means following that advice throws
          away what you typed. Cheap here: the bundle is loaded once by
          this component either way. */}
      <div hidden={half !== "compose"}>
        <Compose
          eventId={eventId}
          workshops={workshops}
          templates={bundle?.templates ?? []}
          supportFormUrl={bundle?.supportFormUrl ?? ""}
        />
      </div>
      <div hidden={half !== "templates"}>
        <Templates bundle={bundle} loading={loading} onChanged={reload} />
      </div>
    </div>
  );
}

/* ── the standing letters ─────────────────────────────────────────── */

function Templates({
  bundle, loading, onChanged,
}: {
  bundle: { templates: ResolvedTemplate[]; supportFormUrl: string } | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!bundle) {
    return (
      <p className="text-[12.5px] text-muted">
        {loading ? "Loading the letters…" : "Could not load the letters."}
      </p>
    );
  }

  const usesLink = bundle.templates.filter((t) => fieldsUsed(`${t.subject}\n${t.body}`).includes("support_form_link"));

  return (
    <div className="max-w-3xl">
      <p className="text-[12.5px] leading-relaxed text-muted">
        The wording each stage starts from. Edit any of them and the change is kept —
        the original is always one click away. Nothing here sends anything; to send,
        open <span className="font-semibold text-fg">Write one now</span> and pick a letter.
      </p>

      <SupportLink url={bundle.supportFormUrl} usedBy={usesLink.length} onSaved={onChanged} />

      {STAGES.map((stage) => {
        const group = bundle.templates.filter((t) => t.stage === stage);
        if (group.length === 0) return null;
        return (
          <section key={stage} className="mt-5">
            <p className={LABEL}>{STAGE_LABELS[stage as Stage]}</p>
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border-2 border-line-strong bg-card">
              {group.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  supportFormUrl={bundle.supportFormUrl}
                  open={openId === t.id}
                  onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <details className="mt-5 rounded-lg border border-line bg-elevated/40 p-3">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-fg">
          What you can put in a letter
        </summary>
        <ul className="mt-2 divide-y divide-line">
          {MERGE_FIELDS.map((f) => (
            <li key={f.key} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <code className="font-mono text-[11.5px] text-brand-500">{`{{${f.key}}}`}</code>
              <span className="text-[12px] text-muted">{f.means}</span>
              {f.perSession && (
                <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-600">
                  one session only
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">
          A letter using a <span className="text-amber-600">one session only</span> field
          can be sent to one workshop&rsquo;s list, not to the whole week — otherwise it
          would tell some people a time that is not theirs. Sending refuses in that case.
        </p>
      </details>
    </div>
  );
}

/**
 * The travel-and-accommodation form link.
 *
 * One setting rather than a URL typed into each letter that mentions it:
 * the same link appears in more than one, and a link that is right in
 * one and stale in the other is worse than having none.
 */
function SupportLink({ url, usedBy, onSaved }: { url: string; usedBy: number; onSaved: () => void }) {
  const [value, setValue] = useState(url);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { setValue(url); }, [url]);

  return (
    <div className={`mt-4 ${CARD} ${!url ? "border-amber-500/50" : ""}`}>
      <p className={LABEL}>Travel &amp; accommodation form</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Where <code className="font-mono text-[11.5px] text-brand-500">{"{{support_form_link}}"}</code> points.
        {usedBy > 0 && ` Used by ${usedBy} letter${usedBy > 1 ? "s" : ""}.`}
        {!url && " Not set yet — a letter that needs it cannot be sent until it is."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className={`${LINE} min-w-0 flex-1`}
          value={value}
          placeholder="https://…"
          onChange={(e) => { setValue(e.target.value); setSaved(false); setProblem(null); }}
        />
        <button
          className={BTN}
          disabled={pending || value === url}
          onClick={() => start(async () => {
            const r = await saveSupportFormUrl(value);
            if (r.ok) { setSaved(true); onSaved(); } else setProblem(r.problem ?? "Could not save it.");
          })}
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
      </div>
      {problem && <p className="mt-1.5 text-[11.5px] text-red-500">{problem}</p>}
      {saved && !problem && <p className="mt-1.5 text-[11.5px] text-emerald-600">Saved.</p>}
    </div>
  );
}

function TemplateRow({
  template, supportFormUrl, open, onToggle, onChanged,
}: {
  template: ResolvedTemplate;
  supportFormUrl: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [problems, setProblems] = useState<string[]>([]);
  // A SNAPSHOT of what was saved, not a boolean.
  //
  // The badge used to be gated on a flag the re-seed effect cleared, and
  // that effect fires on the reload the save itself triggers — so it
  // painted for about one frame. A snapshot compared against the props
  // survives the reload and retires itself when anything moves on.
  const [savedAs, setSavedAs] = useState<{ s: string; b: string } | null>(null);
  const [arming, setArming] = useState(false);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState(false);

  // Re-seeded when the stored version changes under us — after a reset,
  // or after somebody else saved.
  useEffect(() => { setSubject(template.subject); setBody(template.body); setArming(false); },
    [template.subject, template.body]);

  const saved = savedAs !== null
    && savedAs.s === template.subject.trim() && savedAs.b === template.body;

  const dirty = subject !== template.subject || body !== template.body;
  const sample = Object.fromEntries(MERGE_FIELDS.map((f) => [
    f.key, f.key === "support_form_link" ? (supportFormUrl || "") : f.sample,
  ]));
  const shownSubject = render(subject, sample);
  const shownBody = render(body, sample);

  return (
    <li className={open ? "bg-elevated/30" : ""}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-elevated/50"
      >
        <ChevronDown size={14} className={`mt-0.5 shrink-0 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-fg">{template.name}</span>
            {template.edited && (
              <span className="rounded border border-brand-500/50 bg-brand-500/10 px-1.5 text-[10px] text-brand-500">edited</span>
            )}
            {needsOneSession(`${template.subject}\n${template.body}`) && (
              <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] text-amber-600">one session</span>
            )}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{template.when}</span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-3.5 py-3">
          <label className="block"><span className={LABEL}>Subject</span>
            <input
              className={LINE}
              maxLength={SUBJECT_MAX}
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setSavedAs(null); setArming(false); }}
            /></label>
          <label className="mt-3 block"><span className={LABEL}>Message</span>
            <textarea
              rows={16}
              maxLength={BODY_MAX}
              className={`${LINE} font-mono text-[12.5px] leading-relaxed`}
              value={body}
              onChange={(e) => { setBody(e.target.value); setSavedAs(null); setArming(false); }}
            /></label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={PRIMARY}
              disabled={pending || !dirty}
              onClick={() => start(async () => {
                const r = await saveEmailTemplate(template.id, subject, body);
                setProblems(r.problems ?? []);
                if (r.ok) { setSavedAs({ s: subject.trim(), b: body }); onChanged(); }
              })}
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
            <button className={BTN} onClick={() => setPreview(!preview)}>
              <Eye size={13} /> {preview ? "Hide" : "Preview"}
            </button>
            {/* Two clicks, like sending. Somebody negotiated these
                words and there is no version history to get them back
                from — only the audit log. Sending in this same file is
                deliberately two clicks for a smaller loss than this. */}
            {template.edited && !arming && (
              <button className={BTN} disabled={pending} onClick={() => setArming(true)}>
                <RotateCcw size={13} /> Discard my wording
              </button>
            )}
            {arming && (
              <span role="alert" className="inline-flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11.5px] text-amber-600">
                Throw away your wording and go back to the shipped letter?
                {dirty && " Unsaved changes go too."}
                <button
                  className="rounded bg-brand px-2 py-0.5 text-[11px] font-bold text-white hover:brightness-110 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => start(async () => {
                    await resetEmailTemplate(template.id);
                    setProblems([]); setSavedAs(null); setArming(false); onChanged();
                  })}
                >
                  {pending ? "Discarding…" : "Yes, discard"}
                </button>
                <button className="underline disabled:opacity-40" disabled={pending} onClick={() => setArming(false)}>
                  Keep it
                </button>
              </span>
            )}
            {saved && !dirty && <span role="status" className="text-[11.5px] text-emerald-600">Saved.</span>}
          </div>

          {problems.length > 0 && (
            <ul role="alert" className="mt-2 space-y-1 rounded-md border border-red-500/50 bg-red-500/10 p-2">
              {problems.map((p) => <li key={p} className="text-[11.5px] text-red-500">{p}</li>)}
            </ul>
          )}

          {preview && (
            <div className="mt-3 rounded-lg border border-line bg-card p-3">
              <p className={LABEL}>As one person would read it</p>
              <p className="mt-1.5 text-[12.5px] font-semibold text-fg">{shownSubject.text}</p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-muted">
                {shownBody.text}
              </pre>
              {[...new Set([...shownSubject.missing, ...shownBody.missing])].length > 0 && (
                <p className="mt-2 text-[11.5px] text-amber-600">
                  Nothing to put in{" "}
                  {[...new Set([...shownSubject.missing, ...shownBody.missing])].map((m) => `{{${m}}}`).join(", ")}
                  {" "}yet — the placeholder is left in the text exactly as you see it above,
                  and the letter cannot go out until it has a value.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ── writing one now ──────────────────────────────────────────────── */

function Compose({
  eventId, workshops, templates, supportFormUrl,
}: {
  eventId: string; workshops: AdminWorkshop[];
  templates: ResolvedTemplate[]; supportFormUrl: string;
}) {
  const [audience, setAudience] = useState<Audience>("confirmed");
  const [workshopId, setWorkshopId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyBy, setReplyBy] = useState("");
  const [from, setFrom] = useState("");
  const [plan, setPlan] = useState<
    { recipients: { email: string; name: string }[]; configured: boolean; manySessions: boolean } | null
  >(null);
  const [result, setResult] = useState<string | null>(null);
  const [failedSend, setFailedSend] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const usesReplyBy = fieldsUsed(`${subject}\n${body}`).includes("reply_by");
  // The same function the send action refuses with, so the warning here
  // and the refusal there cannot describe different rules.
  const refusal = refusesMultiSession(subject, body, plan?.manySessions ?? false);
  const missingGlobals = unfilledGlobals(subject, body, {
    event: "the event", coordinator: "the team",
    reply_by: replyBy.trim() || undefined,
    support_form_link: supportFormUrl || undefined,
  });
  const blocked = Boolean(refusal) || missingGlobals.length > 0 || (usesReplyBy && !replyBy.trim());

  /*
   * Typing anything disarms the confirm strip.
   *
   * Arming and then editing used to leave "Yes, send" live against
   * wording the guards had not seen — clear {{reply_by}} after arming
   * and the send went through and failed every recipient. Two clicks
   * only means something if the second one is about what the first one
   * showed you.
   */
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setConfirming(false); };

  // The arm button unmounts when the strip appears, which drops focus to
  // the body — a keyboard user is left nowhere, and a screen reader is
  // told nothing about the confirmation that just appeared.
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  const check = () =>
    start(async () => {
      setResult(null);
      setFailedSend(false);
      setConfirming(false);
      setPlan(await previewAudience(eventId, audience, workshopId || undefined));
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className={LABEL}>Who</span>
            <select className={LINE} value={audience} onChange={(e) => { setAudience(e.target.value as Audience); setPlan(null); }}>
              <option value="confirmed">Confirmed seats</option>
              <option value="waitlist">Waitlist</option>
              <option value="pending">Awaiting approval</option>
              <option value="all">Everyone booked</option>
            </select></label>
          <label><span className={LABEL}>Which workshop</span>
            <select className={LINE} value={workshopId} onChange={(e) => { setWorkshopId(e.target.value); setPlan(null); }}>
              <option value="">All workshops</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select></label>
        </div>
        {/* Start from a standing letter rather than from a blank box.
            The wording for a decline should be the one that was agreed
            when nobody was in a hurry, not whatever gets typed at the
            moment somebody has forty of them to send. */}
        <label className="mt-3 block"><span className={LABEL}>Start from</span>
          <select
            className={LINE}
            value={from}
            onChange={(e) => {
              const id = e.target.value;
              const t = templates.find((x) => x.id === id);
              // Loading over something written is not undoable — React
              // sets the value programmatically, so the browser's own
              // undo does not bring it back. Asked only when there is
              // something to lose.
              const written = subject.trim() || body.trim();
              if (written && !confirm("Replace what you have written with this letter?")) {
                e.target.value = from;
                return;
              }
              setFrom(id);
              setConfirming(false);
              if (t) { setSubject(t.subject); setBody(t.body); }
              else { setSubject(""); setBody(""); }
            }}
          >
            <option value="">Start from nothing — clears the message</option>
            {STAGES.map((stage) => {
              const group = templates.filter((t) => t.stage === stage);
              if (group.length === 0) return null;
              return (
                <optgroup key={stage} label={STAGE_LABELS[stage as Stage]}>
                  {group.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              );
            })}
          </select></label>

        <label className="mt-3 block"><span className={LABEL}>Subject</span>
          <input className={LINE} value={subject} onChange={(e) => edit(setSubject)(e.target.value)} /></label>
        <label className="mt-3 block"><span className={LABEL}>Message</span>
          <textarea
            rows={9}
            className={`${LINE} font-mono text-[12.5px]`}
            value={body}
            onChange={(e) => edit(setBody)(e.target.value)}
            placeholder={"Hello {{name}},\n\n…"}
          /></label>
        {usesReplyBy && (
          <label className="mt-3 block"><span className={LABEL}>Reply needed by</span>
            <input
              className={LINE}
              value={replyBy}
              placeholder="Monday 19 October"
              onChange={(e) => edit(setReplyBy)(e.target.value)}
            />
            <span className="mt-1 block text-[11.5px] text-subtle">
              Fills <code className="font-mono">{"{{reply_by}}"}</code>. Sending refuses while it is blank.
            </span></label>
        )}

        <p className="mt-1 text-[11.5px] leading-relaxed text-subtle">
          Fields in <code className="font-mono">{"{{double braces}}"}</code> are filled in per person —
          the full list is under <span className="font-semibold">Standing letters</span>.
          One message each, never a bcc blast.
        </p>

        {/* Said before the send button, not after it is refused: a
            warning that only appears once you have already committed is
            not a warning, it is a report. */}
        {refusal && (
          <p role="alert" className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-[11.5px] leading-relaxed text-amber-600">
            {refusal}
          </p>
        )}
        {missingGlobals.length > 0 && (
          <p role="alert" className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-[11.5px] leading-relaxed text-amber-600">
            Nothing to put in {missingGlobals.map((f) => `{{${f}}}`).join(", ")}.
            {missingGlobals.includes("support_form_link") && " Set the form link under Standing letters."}
            {" "}Sending refuses until it has a value.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={BTN} onClick={check} disabled={pending}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} See who this reaches
          </button>

          {/* Sending is deliberately two clicks: the first shows who and
              how many, the second is the one that cannot be taken back. */}
          {plan && plan.recipients.length > 0 && !confirming && (
            <button
              className={PRIMARY}
              disabled={!subject.trim() || !body.trim() || blocked}
              onClick={() => setConfirming(true)}
            >
              <Mail size={13} /> Send to {plan.recipients.length}…
            </button>
          )}
          {confirming && plan && (
            <span role="alert" className="inline-flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[12.5px] text-amber-600">
              Send to {plan.recipients.length} people? This cannot be undone.
              {/* Disabled while it runs. Several hundred messages take
                  minutes, and a strip that does not change is an
                  invitation to click again — which used to send the
                  whole audience a second time. */}
              <button
                ref={confirmRef}
                className="rounded bg-brand px-2 py-1 text-[11.5px] font-bold text-white hover:brightness-110 disabled:opacity-50"
                disabled={pending || blocked || !plan.configured}
                onClick={() =>
                  start(async () => {
                    const r = await sendToAudience({
                      eventId, audience, workshopId: workshopId || undefined,
                      subject, body, confirmed: true,
                      replyBy: replyBy.trim() || undefined,
                    });
                    setConfirming(false);
                    // The reason is shown whether or not ok is true.
                    // sendToAudience returns ok with a problem set when
                    // some messages failed, and "Sent 0, 40 failed."
                    // with no reason is indistinguishable from an
                    // outage — so the next thing anybody does is send
                    // the whole list again.
                    setFailedSend(!r.ok || r.failed > 0);
                    setResult(
                      r.ok
                        ? `Sent ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}.${r.problem ? ` ${r.problem}` : ""}`
                        : r.problem ?? "Failed.",
                    );
                  })
                }
              >
                {pending ? "Sending…" : "Yes, send"}
              </button>
              <button className="text-[11.5px] underline disabled:opacity-40" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
            </span>
          )}
          {result && (
            <span
              role="status"
              className={`inline-flex items-center gap-1.5 text-[12.5px] ${
                failedSend ? "text-red-500" : "text-emerald-600"
              }`}
            >
              {failedSend ? <AlertTriangle size={13} /> : <Check size={13} />} {result}
            </span>
          )}
        </div>
      </div>

      <aside className={CARD}>
        <p className={LABEL}>Recipients</p>
        {!plan ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing is sent, and no addresses are shown, until you ask who this
            would reach.
          </p>
        ) : (
          <>
            {!plan.configured && (
              <p className="mt-2 inline-flex items-start gap-2 text-[12px] text-amber-600">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Mail is not configured on this deployment, so sending is disabled.
              </p>
            )}
            <p className="mt-2 text-[12.5px] text-muted">{plan.recipients.length} people, duplicates removed.</p>
            <ul className="mt-2 max-h-80 space-y-1 overflow-auto">
              {plan.recipients.map((r) => (
                <li key={r.email} className="truncate text-[11.5px] text-muted">
                  <span className="text-fg">{r.name || "—"}</span>{" "}
                  <span className="font-mono">{r.email}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
