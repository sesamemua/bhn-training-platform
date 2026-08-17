"use client";

/**
 * The newsletter content calendar.
 *
 * Each month is a real month grid — seven columns, week per row — with
 * the production window drawn over it the way a calendar draws a
 * multi-day event. Structure between months comes from hairlines and
 * typography rather than cards.
 *
 * Reminders sit collapsed behind a one-line summary. Twelve months × four
 * reminders × three controls is 144 always-live buttons, which is not a
 * calendar, it is a control panel; at rest each month says what it will
 * do in a sentence and opens only when asked.
 */
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Sparkles,
  Undo2,
} from "lucide-react";
import {
  REMINDER_LABEL,
  SEND_WEEKDAYS,
  WEEKDAY_LABEL,
  type ReminderKind,
  type ReminderMode,
} from "@/lib/newsletter/schedule";
import type { NewsletterConfig } from "@/lib/newsletter/config";
import { NewsletterMonthGrid, type LaneCycle } from "./NewsletterMonthGrid";
import { ReminderSendDialog, type SendArgs } from "./ReminderSendDialog";

interface Reminder {
  id: string;
  kind: string;
  scheduledFor: string;
  mode: string;
  status: string;
  sentAt: string | null;
  sentTo: string[];
  error: string | null;
}

interface Cycle extends LaneCycle {
  sendDateAdjusted: boolean;
  approvedAt: string | null;
  approvedByName: string | null;
  approvalNote: string | null;
  reminders: Reminder[];
}

const API = "/api/workspace/newsletter/calendar";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

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

export function NewsletterCalendarClient({
  initialCycles,
  initialConfig,
  holidays,
  canEdit,
  viewerIsApprover,
  coordinatorName,
  approverName,
}: {
  initialCycles: Cycle[];
  initialConfig: NewsletterConfig;
  holidays: string[];
  canEdit: boolean;
  viewerIsApprover: boolean;
  coordinatorName: string;
  approverName: string;
}) {
  const [cycles, setCycles] = useState<Cycle[]>(initialCycles);
  const [config, setConfig] = useState<NewsletterConfig>(initialConfig);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [months, setMonths] = useState(6);

  const today = useMemo(todayIso, []);

  const post = useCallback(async (payload: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
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
        frozen?: number;
        cycle?: Cycle;
      };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Something went wrong.");
        return null;
      }
      if (j.cycles) setCycles(j.cycles);
      if (j.config) setConfig(j.config);
      if (j.cycle) setCycles((cur) => cur.map((c) => (c.id === j.cycle!.id ? { ...c, ...j.cycle! } : c)));
      return j;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const generate = async () => {
    const j = await post(
      { action: "generate", startMonth: today.slice(0, 7), months },
      "generate",
    );
    if (j) {
      setNote(
        `Planned ${months} month${months === 1 ? "" : "s"}.` +
          (j.frozen ? ` ${j.frozen} left as they were — already approved, sent, or moved by hand.` : ""),
      );
    }
  };

  return (
    <div>
      {/* ── the rule of the thing, stated once, before anyone is surprised ── */}
      <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
        One issue a month, landing in the third week on a{" "}
        <strong className="font-semibold text-fg">
          {WEEKDAY_LABEL[config.schedule.sendWeekday]}
        </strong>{" "}
        — never a Monday or Friday. Every other date is counted backwards from
        the send day in working days, skipping weekends and holidays:{" "}
        {config.schedule.draftDays} for the program leads to write,{" "}
        {config.schedule.buildDays} to build and review.
        {canEdit && " Drag the highlighted days to move an issue; the ± controls lengthen a window."}
      </p>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line pb-5">
          <div className="flex items-center gap-2">
            <label htmlFor="months" className="text-[12px] text-muted">
              Plan
            </label>
            <input
              id="months"
              type="number"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className="w-14 border-0 border-b border-line bg-transparent px-0 py-1 text-center text-[13px] font-semibold text-fg outline-none focus-visible:border-brand-500"
            />
            <span className="text-[12px] text-muted">months ahead</span>
          </div>
          <button
            onClick={generate}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-400 transition-colors hover:text-brand-200 disabled:opacity-50"
          >
            {busy === "generate" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Fill the calendar
          </button>
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="text-[13px] font-semibold text-muted transition-colors hover:text-fg"
          >
            {showConfig ? "Hide settings" : "Settings"}
          </button>
        </div>
      )}

      {showConfig && canEdit && (
        <ConfigPanel
          config={config}
          busy={busy === "config"}
          onSave={(next) => post({ action: "saveConfig", config: next }, "config")}
        />
      )}

      {(note || error) && (
        <p
          className={`mt-4 text-[13px] ${error ? "text-red-500" : "text-muted"}`}
          role={error ? "alert" : "status"}
        >
          {error ?? note}
        </p>
      )}

      {/* ── lanes ───────────────────────────────────────────────────── */}
      {cycles.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[15px] font-semibold text-fg">No dates published yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
            {canEdit
              ? "Choose how many months to plan and fill the calendar. Nothing is emailed until you say so."
              : `${coordinatorName} sets the newsletter schedule. You'll get an email when your section is due.`}
          </p>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-line">
          {cycles.map((c) => (
            <NewsletterMonthGrid
              key={c.id}
              cycle={c}
              today={today}
              holidays={holidays}
              draggable={canEdit}
              onCommit={(patch) => post({ action: "moveCycle", cycleId: c.id, ...patch }, c.id)}
            >
              <CycleFooter
                cycle={c}
                today={today}
                canEdit={canEdit}
                viewerIsApprover={viewerIsApprover}
                approverName={approverName}
                busy={busy}
                onAction={post}
              />
            </NewsletterMonthGrid>
          ))}
        </div>
      )}
    </div>
  );
}

// ── per-month footer: reminders (collapsed) + sign-off ───────────────

function CycleFooter({
  cycle,
  today,
  canEdit,
  viewerIsApprover,
  approverName,
  busy,
  onAction,
}: {
  cycle: Cycle;
  today: string;
  canEdit: boolean;
  viewerIsApprover: boolean;
  approverName: string;
  busy: string | null;
  onAction: (payload: Record<string, unknown>, key: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  /** Reminder whose send dialog is open. The dialog is the confirm step —
   *  it shows the composed mail and its real recipients before sending. */
  const [sendFor, setSendFor] = useState<string | null>(null);

  const sent = cycle.reminders.filter((r) => r.status === "sent").length;
  const failed = cycle.reminders.filter((r) => r.status === "failed").length;
  const waiting = cycle.reminders.filter((r) => r.status === "pending").length;
  const manualWaiting = cycle.reminders.filter(
    (r) => r.status === "pending" && r.mode === "manual",
  ).length;

  // Sign-off only becomes real once there is something built to sign off.
  const reviewable = today >= cycle.buildStart && cycle.status !== "sent";

  const summary =
    failed > 0
      ? `${failed} reminder${failed === 1 ? "" : "s"} didn't send`
      : waiting === 0
        ? `All ${cycle.reminders.length} reminders handled`
        : manualWaiting > 0
          ? `${waiting} reminder${waiting === 1 ? "" : "s"} to come — you send ${manualWaiting} of them`
          : `${waiting} reminder${waiting === 1 ? "" : "s"} to come, all automatic`;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[12px] text-subtle transition-colors hover:text-muted"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
        {summary}
        {sent > 0 && <span className="text-subtle"> · {sent} sent</span>}
      </button>

      {open && (
        <ul className="mt-2 space-y-2 border-l border-line pl-4">
          {cycle.reminders.map((r) => {
            const label = REMINDER_LABEL[r.kind as ReminderKind] ?? r.kind;
            const working = busy === r.id;
            return (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 text-[12.5px]">
                <div className="min-w-0">
                  <p className="text-fg">
                    <span className="font-semibold">{label}</span>
                    <span className="text-subtle"> · {dayLabel(r.scheduledFor)}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-subtle">
                    {r.status === "sent"
                      ? `Sent to ${r.sentTo.join(", ") || "—"}`
                      : r.status === "failed"
                        ? `Didn't send — ${r.error ?? "unknown error"}`
                        : r.status === "skipped"
                          ? r.error === "SMTP not configured"
                            ? "Not sent — email isn't configured on this platform"
                            : "You chose not to send this one"
                          : r.mode === "manual"
                            ? "Will email you a ready-to-send copy"
                            : "Will send itself"}
                  </p>
                </div>

                {canEdit && (
                  <div className="flex shrink-0 items-center gap-3">
                    {/* Available even once sent: a chase often needs sending
                        twice, and the dialog is also where the send history
                        lives. */}
                    <button
                      onClick={() => setSendFor(r.id)}
                      disabled={working}
                      className="text-[12px] font-semibold text-brand-400 hover:text-brand-200 disabled:opacity-50"
                    >
                      {working
                        ? "Sending…"
                        : r.status === "failed"
                          ? "Try again"
                          : r.status === "sent" || r.status === "skipped"
                            ? "History / resend…"
                            : "Review and send…"}
                    </button>
                    {r.status === "pending" && (
                      <button
                        onClick={() =>
                          onAction(
                            {
                              action: "setReminderMode",
                              reminderId: r.id,
                              mode: r.mode === "auto" ? "manual" : "auto",
                            },
                            r.id,
                          )
                        }
                        disabled={working}
                        className="text-[12px] text-muted hover:text-fg disabled:opacity-50"
                      >
                        {r.mode === "auto" ? "Let me send it" : "Send automatically"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* sign-off */}
      <div className="mt-2">
        {cycle.approvedAt ? (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-emerald-600">
            <CheckCircle2 size={13} />
            Approved by {cycle.approvedByName ?? approverName}
            {cycle.approvalNote ? ` — “${cycle.approvalNote}”` : ""}
          </p>
        ) : !reviewable ? (
          <p className="text-[12px] text-subtle">
            Sign-off opens {dayLabel(cycle.buildStart)}, once the issue is built.
          </p>
        ) : viewerIsApprover ? (
          <ApproveControl cycleId={cycle.id} busy={busy} onAction={onAction} />
        ) : (
          <p className="text-[12px] text-subtle">Waiting on {approverName} to sign off.</p>
        )}
      </div>

      {cycle.sendDateAdjusted && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-amber-600">
          <AlertTriangle size={11} />
          Moved off {WEEKDAY_LABEL[3]} — a holiday fell on the usual day.
        </p>
      )}

      <ReminderSendDialog
        open={sendFor !== null}
        reminderId={sendFor}
        monthLabel={monthLabel(cycle.month)}
        sending={busy !== null && busy === sendFor}
        onClose={() => setSendFor(null)}
        onSend={async (args: SendArgs) => {
          const id = sendFor;
          if (!id) return;
          const res = await onAction({ action: "sendReminder", reminderId: id, ...args }, id);
          if (res) setSendFor(null);
        }}
      />
    </div>
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
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => onAction({ action: "approve", cycleId, note: note.trim() || undefined }, cycleId)}
        disabled={working}
        className="inline-flex items-center gap-1.5 text-[13px] font-bold text-emerald-600 transition-colors hover:text-emerald-500 disabled:opacity-50"
      >
        {working ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
        Sign this issue off
      </button>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        maxLength={500}
        className="min-w-0 flex-1 border-0 border-b border-line bg-transparent px-0 py-1 text-[12.5px] text-fg outline-none placeholder:text-subtle focus-visible:border-brand-500"
      />
    </div>
  );
}

// ── settings: underlines, not boxes ─────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const INPUT =
  "w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[13px] text-fg outline-none transition-colors focus-visible:border-brand-500";

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
  const setSchedule = (patch: Partial<NewsletterConfig["schedule"]>) =>
    setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } }));

  return (
    <div className="space-y-6 border-b border-line py-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Send day">
          <select
            value={draft.schedule.sendWeekday}
            onChange={(e) => setSchedule({ sendWeekday: Number(e.target.value) as 2 | 3 | 4 })}
            className={INPUT}
          >
            {SEND_WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Week of month">
          <input
            type="number"
            min={1}
            max={5}
            value={draft.schedule.weekOfMonth}
            onChange={(e) => setSchedule({ weekOfMonth: Number(e.target.value) })}
            className={INPUT}
          />
        </Field>
        <Field label="Writing days">
          <input
            type="number"
            min={1}
            max={10}
            value={draft.schedule.draftDays}
            onChange={(e) => setSchedule({ draftDays: Number(e.target.value) })}
            className={INPUT}
          />
        </Field>
        <Field label="Build days">
          <input
            type="number"
            min={1}
            max={10}
            value={draft.schedule.buildDays}
            onChange={(e) => setSchedule({ buildDays: Number(e.target.value) })}
            className={INPUT}
          />
        </Field>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
          Who writes which section
        </p>
        <ul className="mt-2 space-y-2">
          {draft.leads.map((l, i) => (
            <li key={`${l.section}-${i}`} className="grid grid-cols-[5rem_1fr_1.4fr] items-baseline gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-400">
                {l.section}
              </span>
              <input
                value={l.name}
                aria-label={`${l.section} lead name`}
                onChange={(e) =>
                  setDraft((d) => {
                    const leads = [...d.leads];
                    leads[i] = { ...leads[i], name: e.target.value };
                    return { ...d, leads };
                  })
                }
                className={INPUT}
              />
              <input
                value={l.email}
                aria-label={`${l.section} lead email`}
                onChange={(e) =>
                  setDraft((d) => {
                    const leads = [...d.leads];
                    leads[i] = { ...leads[i], email: e.target.value };
                    return { ...d, leads };
                  })
                }
                className={INPUT}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Copied on lead emails">
          <input
            value={draft.cc.join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                cc: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
              }))
            }
            className={INPUT}
          />
        </Field>
        <Field label="Signs off">
          <input
            value={draft.approver.email}
            onChange={(e) => setDraft((d) => ({ ...d, approver: { ...d.approver, email: e.target.value } }))}
            className={INPUT}
          />
        </Field>
        <Field label="Coordinates (gets the manual reminders)">
          <input
            value={draft.coordinator.email}
            onChange={(e) =>
              setDraft((d) => ({ ...d, coordinator: { ...d.coordinator, email: e.target.value } }))
            }
            className={INPUT}
          />
        </Field>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
          How each reminder goes out
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          {(Object.keys(draft.modes) as ReminderKind[]).map((k) => (
            <li key={k} className="flex items-baseline gap-2 text-[13px]">
              <span className="text-muted">{REMINDER_LABEL[k]}</span>
              <select
                value={draft.modes[k]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, modes: { ...d.modes, [k]: e.target.value as ReminderMode } }))
                }
                className="border-0 border-b border-line bg-transparent px-0 py-0.5 text-[12.5px] font-semibold text-fg outline-none focus-visible:border-brand-500"
              >
                <option value="auto">sends itself</option>
                <option value="manual">I send it</option>
              </select>
            </li>
          ))}
        </ul>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={draft.useStatHolidays}
          onChange={(e) => setDraft((d) => ({ ...d, useStatHolidays: e.target.checked }))}
        />
        Skip statutory holidays when counting working days
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => onSave(draft)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-400 hover:text-brand-200 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          Save settings
        </button>
        <button
          onClick={() => setDraft(config)}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"
        >
          <Undo2 size={12} />
          Reset
        </button>
        <p className="text-[12px] text-subtle">
          Saving changes the rules, not the dates already on the calendar. Fill
          the calendar again to apply them — months you moved by hand stay put.
        </p>
      </div>
    </div>
  );
}
