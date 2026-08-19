"use client";

/**
 * The Admin tab: decision model, capacity dashboard, registrants, email.
 *
 * Four sections rather than four pages, because they are one job. You
 * change a rule to see who it moves, notice a room is 4 over, raise its
 * capacity, then write to the people it just let in — and a navigation
 * between each of those is four chances to lose your place.
 */
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, Loader2, Mail,
  Plus, Trash2, Users,
} from "lucide-react";
import {
  DEFAULT_RULES, RULE_KINDS, rankApplicants, validateRules,
  type Applicant, type Rule, type RuleKind,
} from "@/lib/allocation/model";
import {
  createWorkshop, previewAudience, removeWorkshop, saveRules, sendToAudience,
  updateWorkshop,
} from "@/app/(dashboard)/admin/workspace/training-admin/actions";
import type { Audience } from "@/lib/allocation/admin-types";

export interface AdminBooking {
  id: string;
  status: string;
  bookedAt: string;
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

type Tab = "model" | "capacity" | "registrants" | "email";

const TABS: { id: Tab; label: string }[] = [
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

const seatsOf = (w: AdminWorkshop) => w.bookings.filter((b) => b.status === "confirmed").length;
const waitOf = (w: AdminWorkshop) => w.bookings.filter((b) => b.status === "waitlist").length;
const pendingOf = (w: AdminWorkshop) => w.bookings.filter((b) => b.status === "pending").length;

export function TrainingAdmin({
  eventId, eventTitle, rules: initialRules, workshops,
}: {
  eventId: string; eventTitle: string; rules: Rule[]; workshops: AdminWorkshop[];
}) {
  const [tab, setTab] = useState<Tab>("model");

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
        {tab === "model" && <DecisionModel initial={initialRules} workshops={workshops} />}
        {tab === "capacity" && <Capacity eventId={eventId} workshops={workshops} />}
        {tab === "registrants" && <Registrants workshops={workshops} />}
        {tab === "email" && <EmailSection eventId={eventId} workshops={workshops} />}
      </div>
    </div>
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
    const applicants: Applicant[] = busiest.bookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        name: b.user?.name || b.user?.email || "Unnamed",
        appliedAt: b.bookedAt,
        // Out of town is inferred from the country on the account until
        // travel origin is carried through from the registration form.
        isOutOfTown: !!b.user?.country && b.user.country.toLowerCase() !== "canada",
        organizationType: b.user?.organization ?? null,
        seatsHeld: 0,
      }));
    return rankApplicants(applicants, rules, busiest.capacity);
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
                    onCommit={(v) => start(() => void updateWorkshop(w.id, { capacity: v }))}
                  />
                  <NumberField
                    label="Waitlist"
                    value={w.waitlistCapacity}
                    onCommit={(v) => start(() => void updateWorkshop(w.id, { waitlistCapacity: v }))}
                  />
                  <button
                    className="rounded p-1.5 text-subtle hover:bg-elevated hover:text-red-500"
                    title={w.bookings.length ? "Retire this workshop (it has bookings)" : "Delete this workshop"}
                    onClick={() => start(() => void removeWorkshop(w.id))}
                  >
                    <Trash2 size={14} />
                  </button>
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
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
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
          if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n);
          else setV(String(value));
        }}
        className="mt-0.5 w-20 rounded-md border border-line bg-elevated px-2 py-1 text-[13px] text-fg outline-none focus-visible:border-brand-500"
      />
    </label>
  );
}

function NewWorkshop({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const [pending, start] = useTransition();
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
          onClick={() => start(async () => { await createWorkshop(eventId, f); onDone(); })}
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
        </button>
        <button className={BTN} onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ── registrants ──────────────────────────────────────────────────────

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
  );
}

// ── email ────────────────────────────────────────────────────────────

function EmailSection({ eventId, workshops }: { eventId: string; workshops: AdminWorkshop[] }) {
  const [audience, setAudience] = useState<Audience>("confirmed");
  const [workshopId, setWorkshopId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [plan, setPlan] = useState<{ recipients: { email: string; name: string }[]; configured: boolean } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const check = () =>
    start(async () => {
      setResult(null);
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
        <label className="mt-3 block"><span className={LABEL}>Subject</span>
          <input className={LINE} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label className="mt-3 block"><span className={LABEL}>Message</span>
          <textarea
            rows={9}
            className={`${LINE} font-mono text-[12.5px]`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Hello {{name}},\n\n…"}
          /></label>
        <p className="mt-1 text-[11.5px] text-subtle">
          <code className="font-mono">{"{{name}}"}</code> becomes the person&rsquo;s name,
          or &ldquo;there&rdquo; if we do not have one. One message each — never a bcc blast.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={BTN} onClick={check} disabled={pending}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} See who this reaches
          </button>

          {/* Sending is deliberately two clicks: the first shows who and
              how many, the second is the one that cannot be taken back. */}
          {plan && plan.recipients.length > 0 && !confirming && (
            <button
              className={PRIMARY}
              disabled={!subject.trim() || !body.trim()}
              onClick={() => setConfirming(true)}
            >
              <Mail size={13} /> Send to {plan.recipients.length}…
            </button>
          )}
          {confirming && plan && (
            <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[12.5px] text-amber-600">
              Send to {plan.recipients.length} people? This cannot be undone.
              <button
                className="rounded bg-brand px-2 py-1 text-[11.5px] font-bold text-white hover:brightness-110"
                onClick={() =>
                  start(async () => {
                    const r = await sendToAudience({
                      eventId, audience, workshopId: workshopId || undefined,
                      subject, body, confirmed: true,
                    });
                    setConfirming(false);
                    setResult(r.ok ? `Sent ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}.` : r.problem ?? "Failed.");
                  })
                }
              >
                Yes, send
              </button>
              <button className="text-[11.5px] underline" onClick={() => setConfirming(false)}>Cancel</button>
            </span>
          )}
          {result && <span className="text-[12.5px] text-muted">{result}</span>}
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
