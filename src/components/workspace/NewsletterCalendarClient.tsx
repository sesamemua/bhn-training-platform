"use client";

/**
 * The newsletter content calendar.
 *
 * Reads as a production schedule, not a month grid: one row per issue,
 * each showing the four milestones in the order they happen and the four
 * reminders hanging off them. A month grid would waste most of its cells —
 * there is exactly one issue a month, and what a coordinator needs to see
 * is the run-up, not the empty days around it.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  Settings2,
  SkipForward,
  Sparkles,
} from "lucide-react";
import {
  REMINDER_LABEL,
  SEND_WEEKDAYS,
  WEEKDAY_LABEL,
  type ReminderKind,
  type ReminderMode,
} from "@/lib/newsletter/schedule";
import type { NewsletterConfig } from "@/lib/newsletter/config";

interface Reminder {
  id: string;
  kind: string;
  scheduledFor: string;
  mode: string;
  status: string;
  sentAt: string | null;
  sentTo: string[];
  sentCc: string[];
  error: string | null;
}

interface Cycle {
  id: string;
  month: string;
  draftOpen: string;
  draftDue: string;
  buildStart: string;
  approvalDue: string;
  sendDate: string;
  sendDateAdjusted: boolean;
  status: string;
  approvedAt: string | null;
  approvedByName: string | null;
  approvalNote: string | null;
  reminders: Reminder[];
}

const API = "/api/workspace/newsletter/calendar";

const monthLabel = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const todayIso = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

export function NewsletterCalendarClient({
  initialCycles,
  initialConfig,
  canEdit,
  viewerIsApprover,
}: {
  initialCycles: Cycle[];
  initialConfig: NewsletterConfig;
  canEdit: boolean;
  viewerIsApprover: boolean;
}) {
  const [cycles, setCycles] = useState<Cycle[]>(initialCycles);
  const [config, setConfig] = useState<NewsletterConfig>(initialConfig);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [months, setMonths] = useState(6);

  const today = useMemo(todayIso, []);

  const post = useCallback(async (payload: Record<string, unknown>, key: string) => {
    setBusy(key);
    setNote(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        cycles?: Cycle[];
        config?: NewsletterConfig;
        created?: number;
        updated?: number;
        frozen?: number;
        result?: { status: string; to: string[]; error?: string };
        cycle?: Cycle;
      };
      if (!res.ok || !j.ok) {
        setNote(j.error ?? "Something went wrong.");
        return null;
      }
      if (j.cycles) setCycles(j.cycles);
      if (j.config) setConfig(j.config);
      if (j.cycle) {
        setCycles((cur) => cur.map((c) => (c.id === j.cycle!.id ? { ...c, ...j.cycle! } : c)));
      }
      return j;
    } catch (e) {
      setNote((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  // Keep the view honest if someone else generates while this is open.
  useEffect(() => {
    setCycles(initialCycles);
  }, [initialCycles]);

  const generate = async () => {
    const start = today.slice(0, 7);
    const j = await post({ action: "generate", startMonth: start, months }, "generate");
    if (j) {
      setNote(
        `Planned ${months} month${months === 1 ? "" : "s"} — ${j.created ?? 0} new, ${j.updated ?? 0} updated` +
          (j.frozen ? `, ${j.frozen} left alone (already approved or sent)` : "") +
          ".",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* ── planner ─────────────────────────────────────────────── */}
      {canEdit && (
        <section className="rounded-xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-bold text-fg">Plan ahead</h2>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
                One issue a month, out in the third week on a{" "}
                <strong className="text-fg">
                  {WEEKDAY_LABEL[config.schedule.sendWeekday]}
                </strong>
                . Every other date is worked backwards from the send day in
                business days — {config.schedule.draftDays} to write,{" "}
                {config.schedule.buildDays} to build and review. Re-planning
                never touches a cycle that has been approved or sent.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-semibold text-muted" htmlFor="months">
                Months
              </label>
              <input
                id="months"
                type="number"
                min={1}
                max={24}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                className="w-16 rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
              />
              <button
                onClick={generate}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy === "generate" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Generate
              </button>
              <button
                onClick={() => setShowConfig((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-fg"
              >
                <Settings2 size={13} />
                Settings
              </button>
            </div>
          </div>

          {showConfig && (
            <ConfigPanel
              config={config}
              busy={busy === "config"}
              onSave={(next) => post({ action: "saveConfig", config: next }, "config")}
            />
          )}
        </section>
      )}

      {note && (
        <p className="rounded-lg border border-line bg-elevated px-4 py-2.5 text-[13px] text-muted">
          {note}
        </p>
      )}

      {/* ── cycles ──────────────────────────────────────────────── */}
      {cycles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-14 text-center">
          <p className="text-[15px] font-semibold text-fg">No issues planned yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
            Generate a few months and the calendar will lay out every draft
            deadline, build window and send date, with the reminders attached.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cycles.map((c) => (
            <CycleRow
              key={c.id}
              cycle={c}
              today={today}
              canEdit={canEdit}
              viewerIsApprover={viewerIsApprover}
              busy={busy}
              onAction={post}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── one issue ───────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  planned: "text-subtle",
  active: "text-brand-700",
  approved: "text-emerald-600",
  sent: "text-muted",
};

function CycleRow({
  cycle,
  today,
  canEdit,
  viewerIsApprover,
  busy,
  onAction,
}: {
  cycle: Cycle;
  today: string;
  canEdit: boolean;
  viewerIsApprover: boolean;
  busy: string | null;
  onAction: (payload: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const milestones = [
    { label: "Drafts open", date: cycle.draftOpen },
    { label: "Drafts due", date: cycle.draftDue },
    { label: "Build starts", date: cycle.buildStart },
    { label: "Approval", date: cycle.approvalDue },
    { label: "Send", date: cycle.sendDate },
  ];
  const isPast = cycle.sendDate < today;

  return (
    <section className={`rounded-xl border border-line bg-card p-5 ${isPast ? "opacity-70" : ""}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-bold text-fg">{monthLabel(cycle.month)}</h3>
        <span className={`text-[11px] font-bold uppercase tracking-[0.14em] ${STATUS_STYLE[cycle.status] ?? "text-subtle"}`}>
          {cycle.status}
        </span>
      </header>

      {cycle.sendDateAdjusted && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-amber-600">
          <AlertTriangle size={12} />
          Send date moved off its usual weekday — a holiday fell on it.
        </p>
      )}

      {/* milestones */}
      <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {milestones.map((m) => {
          const done = m.date < today;
          const isToday = m.date === today;
          return (
            <li key={m.label}>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
                {m.label}
              </p>
              <p
                className={`mt-0.5 text-[13.5px] font-semibold ${
                  isToday ? "text-brand-700" : done ? "text-subtle" : "text-fg"
                }`}
              >
                {dayLabel(m.date)}
                {isToday && <span className="ml-1.5 text-[11px] font-bold">· today</span>}
              </p>
            </li>
          );
        })}
      </ol>

      {/* reminders */}
      {cycle.reminders.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
            Reminders
          </p>
          <ul className="mt-2 space-y-1.5">
            {cycle.reminders.map((r) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                canEdit={canEdit}
                busy={busy}
                onAction={onAction}
              />
            ))}
          </ul>
        </div>
      )}

      {/* approval */}
      <div className="mt-5 border-t border-line pt-4">
        {cycle.approvedAt ? (
          <p className="inline-flex items-center gap-2 text-[13px] text-emerald-600">
            <CheckCircle2 size={14} />
            <span>
              Approved by <strong>{cycle.approvedByName ?? "the approver"}</strong> on{" "}
              {new Date(cycle.approvedAt).toLocaleDateString("en-CA", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {cycle.approvalNote ? ` — “${cycle.approvalNote}”` : ""}
            </span>
          </p>
        ) : viewerIsApprover ? (
          <ApproveControl cycleId={cycle.id} busy={busy} onAction={onAction} />
        ) : (
          <p className="text-[12.5px] text-subtle">
            Awaiting final approval before this issue sends.
          </p>
        )}
      </div>
    </section>
  );
}

function ReminderRow({
  reminder: r,
  canEdit,
  busy,
  onAction,
}: {
  reminder: Reminder;
  canEdit: boolean;
  busy: string | null;
  onAction: (payload: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const label = REMINDER_LABEL[r.kind as ReminderKind] ?? r.kind;
  const pending = r.status === "pending";
  const working = busy === r.id;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="inline-flex w-4 justify-center">
        {r.status === "sent" ? (
          <Check size={13} className="text-emerald-600" />
        ) : r.status === "failed" ? (
          <AlertTriangle size={13} className="text-red-600" />
        ) : r.status === "skipped" ? (
          <SkipForward size={13} className="text-subtle" />
        ) : (
          <Clock size={13} className="text-subtle" />
        )}
      </span>
      <span className="font-semibold text-fg">{label}</span>
      <span className="text-subtle">{dayLabel(r.scheduledFor)}</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-subtle">
        {r.mode === "auto" ? "sends itself" : "you send it"}
      </span>
      {r.status === "sent" && r.sentTo.length > 0 && (
        <span className="text-[12px] text-subtle">→ {r.sentTo.join(", ")}</span>
      )}
      {r.error && <span className="text-[12px] text-red-600">{r.error}</span>}

      {canEdit && pending && (
        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={() =>
              onAction(
                { action: "setReminderMode", reminderId: r.id, mode: r.mode === "auto" ? "manual" : "auto" },
                r.id,
              )
            }
            disabled={working}
            className="text-[12px] font-semibold text-muted hover:text-fg disabled:opacity-50"
          >
            {r.mode === "auto" ? "Make manual" : "Make automatic"}
          </button>
          <button
            onClick={() => onAction({ action: "sendReminder", reminderId: r.id }, r.id)}
            disabled={working}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-900 disabled:opacity-50"
          >
            {working ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Send now
          </button>
          <button
            onClick={() => onAction({ action: "skipReminder", reminderId: r.id }, r.id)}
            disabled={working}
            className="text-[12px] font-semibold text-muted hover:text-fg disabled:opacity-50"
          >
            Skip
          </button>
        </span>
      )}
    </li>
  );
}

function ApproveControl({
  cycleId,
  busy,
  onAction,
}: {
  cycleId: string;
  busy: string | null;
  onAction: (payload: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const working = busy === cycleId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note"
        maxLength={500}
        className="min-w-0 flex-1 rounded-md border border-line bg-elevated px-3 py-1.5 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      />
      <button
        onClick={() => onAction({ action: "approve", cycleId, note: note.trim() || undefined }, cycleId)}
        disabled={working}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {working ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
        Approve this issue
      </button>
    </div>
  );
}

// ── settings ────────────────────────────────────────────────────────

function ConfigPanel({
  config,
  busy,
  onSave,
}: {
  config: NewsletterConfig;
  busy: boolean;
  onSave: (next: NewsletterConfig) => void;
}) {
  const [draft, setDraft] = useState<NewsletterConfig>(config);
  useEffect(() => setDraft(config), [config]);

  const setSchedule = (patch: Partial<NewsletterConfig["schedule"]>) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));

  return (
    <div className="mt-5 space-y-5 border-t border-line pt-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Send day</span>
          <select
            value={draft.schedule.sendWeekday}
            onChange={(e) => setSchedule({ sendWeekday: Number(e.target.value) as 2 | 3 | 4 })}
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          >
            {SEND_WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Week of month</span>
          <input
            type="number"
            min={1}
            max={5}
            value={draft.schedule.weekOfMonth}
            onChange={(e) => setSchedule({ weekOfMonth: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Writing days</span>
          <input
            type="number"
            min={1}
            max={10}
            value={draft.schedule.draftDays}
            onChange={(e) => setSchedule({ draftDays: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Build days</span>
          <input
            type="number"
            min={1}
            max={10}
            value={draft.schedule.buildDays}
            onChange={(e) => setSchedule({ buildDays: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Program leads</p>
        <ul className="mt-2 space-y-1.5">
          {draft.leads.map((l, i) => (
            <li key={`${l.section}-${i}`} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="w-24 shrink-0 font-semibold uppercase tracking-[0.08em] text-brand-700">
                {l.section}
              </span>
              <input
                value={l.name}
                onChange={(e) =>
                  setDraft((d) => {
                    const leads = [...d.leads];
                    leads[i] = { ...leads[i], name: e.target.value };
                    return { ...d, leads };
                  })
                }
                className="w-40 rounded-md border border-line bg-elevated px-2 py-1 text-[13px] text-fg"
              />
              <input
                value={l.email}
                onChange={(e) =>
                  setDraft((d) => {
                    const leads = [...d.leads];
                    leads[i] = { ...leads[i], email: e.target.value };
                    return { ...d, leads };
                  })
                }
                className="min-w-0 flex-1 rounded-md border border-line bg-elevated px-2 py-1 text-[13px] text-fg"
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Cc on lead emails</span>
          <input
            value={draft.cc.join(", ")}
            onChange={(e) =>
              setDraft((d) => ({ ...d, cc: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))
            }
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Approver</span>
          <input
            value={draft.approver.email}
            onChange={(e) => setDraft((d) => ({ ...d, approver: { ...d.approver, email: e.target.value } }))}
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">Coordinator</span>
          <input
            value={draft.coordinator.email}
            onChange={(e) =>
              setDraft((d) => ({ ...d, coordinator: { ...d.coordinator, email: e.target.value } }))
            }
            className="mt-1 w-full rounded-md border border-line bg-elevated px-2 py-1.5 text-[13px] text-fg"
          />
        </label>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
          How each reminder goes out
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {(Object.keys(draft.modes) as ReminderKind[]).map((k) => (
            <li key={k} className="flex items-center gap-2 text-[13px]">
              <span className="text-fg">{REMINDER_LABEL[k]}</span>
              <select
                value={draft.modes[k]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, modes: { ...d.modes, [k]: e.target.value as ReminderMode } }))
                }
                className="rounded-md border border-line bg-elevated px-2 py-1 text-[12.5px] text-fg"
              >
                <option value="auto">sends itself</option>
                <option value="manual">reminds me to send</option>
              </select>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-fg">
        <input
          type="checkbox"
          checked={draft.useStatHolidays}
          onChange={(e) => setDraft((d) => ({ ...d, useStatHolidays: e.target.checked }))}
        />
        Skip statutory holidays when counting business days
      </label>

      <button
        onClick={() => onSave(draft)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        Save settings
      </button>
      <p className="text-[12px] leading-relaxed text-subtle">
        Saving settings does not move existing dates. Press Generate afterwards
        to re-plan — cycles already approved or sent are left untouched.
      </p>
    </div>
  );
}
