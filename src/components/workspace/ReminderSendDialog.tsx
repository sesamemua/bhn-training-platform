"use client";

/**
 * Confirm-and-edit dialog for a newsletter reminder.
 *
 * "Send now" used to be a two-tap inline confirm that fired an opaque
 * template — you couldn't see who it reached or what it said until it had
 * gone. This shows the composed mail, names the real recipients, and lets
 * the subject, To, Cc and body be edited first. The preview re-renders
 * from the server as you type, so what you read is what is sent.
 *
 * The mode banner matters most: in manual mode nothing reaches the leads
 * at all — the coordinator gets a ready-to-forward copy instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FlaskConical, History, Loader2, Mail, Send, UserCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

const API = "/api/workspace/newsletter/calendar";

interface Preview {
  reminderId: string;
  label: string;
  status: string;
  scheduledFor: string;
  mode: "auto" | "manual";
  subject: string;
  heading: string;
  paras: string[];
  to: string[];
  cc: string[];
  deliverTo: string[];
  deliverCc: string[];
  html: string;
  mailConfigured: boolean;
  testTo: string | null;
}

export interface ReminderOverrides {
  subject?: string;
  to?: string[];
  cc?: string[];
  paras?: string[];
}

export interface SendArgs {
  overrides: ReminderOverrides;
  deliverMode: "auto" | "manual";
  force: boolean;
}

interface HistoryEntry {
  id: string;
  mode: string;
  status: string;
  subject: string;
  sentTo: string[];
  error: string | null;
  sentByName: string | null;
  createdAt: string;
}

const MODE_LABEL: Record<string, string> = {
  auto: "Sent to the team",
  manual: "Copy to forward",
  test: "Test to self",
};

const splitEmails = (s: string) =>
  s.split(/[,\s]+/).map((e) => e.trim()).filter(Boolean);
const toParas = (s: string) =>
  s.split(/\n{2,}/).map((p) => p.trim().replace(/\n/g, " ")).filter(Boolean);

export function ReminderSendDialog({
  open,
  reminderId,
  monthLabel,
  sending,
  onClose,
  onSend,
}: {
  open: boolean;
  reminderId: string | null;
  monthLabel: string;
  sending: boolean;
  onClose: () => void;
  onSend: (args: SendArgs) => void;
}) {
  const [deliverMode, setDeliverMode] = useState<"auto" | "manual">("manual");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  /** Bumped after a test send so the history refetches. */
  const [historyTick, setHistoryTick] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [body, setBody] = useState("");

  // Guards the debounced re-render so it can't clobber the fields it just
  // populated on first load.
  const loaded = useRef(false);

  const fetchPreview = useCallback(
    async (id: string, overrides?: ReminderOverrides, mode?: "auto" | "manual") => {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "previewReminder", reminderId: id, overrides, deliverMode: mode }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; preview?: Preview; error?: string };
      if (!res.ok || !j.ok || !j.preview) throw new Error(j.error ?? "Couldn't load the preview.");
      return j.preview;
    },
    [],
  );

  // First load — pull the composed message and seed the editable fields.
  useEffect(() => {
    if (!open || !reminderId) return;
    let cancelled = false;
    loaded.current = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    fetchPreview(reminderId)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setHtml(p.html);
        setSubject(p.subject);
        setTo(p.to.join(", "));
        setCc(p.cc.join(", "));
        setBody(p.paras.join("\n\n"));
        // Always default a HUMAN send to the real recipients. The
        // reminder's own mode governs what the scheduler does when
        // nobody is watching; opening this dialog and pressing send is
        // the approval, and what follows should be the actual send —
        // not a copy the approver then has to forward by hand.
        setDeliverMode("auto");
        loaded.current = true;
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, reminderId, fetchPreview]);

  // Re-render the preview from the server as the message is edited, so the
  // rendered mail always matches the fields rather than the original.
  useEffect(() => {
    if (!open || !reminderId || !loaded.current) return;
    const t = setTimeout(() => {
      fetchPreview(
        reminderId,
        {
          subject: subject.trim() || undefined,
          to: splitEmails(to),
          cc: splitEmails(cc),
          paras: toParas(body),
        },
        deliverMode,
      )
        .then((p) => {
          setHtml(p.html);
          setPreview((cur) => (cur ? { ...cur, deliverTo: p.deliverTo, deliverCc: p.deliverCc } : cur));
        })
        .catch(() => { /* keep the last good render */ });
    }, 600);
    return () => clearTimeout(t);
  }, [open, reminderId, subject, to, cc, body, deliverMode, fetchPreview]);

  // Send history, including tests, for this reminder.
  useEffect(() => {
    if (!open || !reminderId) return;
    let cancelled = false;
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reminderHistory", reminderId }),
    })
      .then((r) => r.json())
      .then((j: { history?: HistoryEntry[] }) => !cancelled && setHistory(j.history ?? []))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, reminderId, historyTick, sending]);

  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);

  const currentOverrides = useCallback(
    (): ReminderOverrides => ({
      subject: subject.trim() || undefined,
      to: splitEmails(to),
      cc: splitEmails(cc),
      paras: toParas(body),
    }),
    [subject, to, cc, body],
  );

  async function sendTest() {
    if (!reminderId || testing) return;
    setTesting(true);
    setTestNote(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "testReminder",
          reminderId,
          overrides: currentOverrides(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; sentTo?: string; error?: string };
      setTestNote(
        !res.ok || !j.ok
          ? (j.error ?? "Test send failed.")
          : `Test sent to ${j.sentTo}. Nobody else received it.`,
      );
    } catch (e) {
      setTestNote((e as Error).message);
    } finally {
      setTesting(false);
      setHistoryTick((t) => t + 1);
    }
  }

  const manual = preview?.mode === "manual";
  const recipients = splitEmails(to);
  const invalid = recipients.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const canSend = !!preview && !loading && !sending && recipients.length > 0 && invalid.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      resizable
      title={preview ? `${preview.label} — ${monthLabel}` : "Reminder"}
      description={
        preview
          ? `Scheduled for ${preview.scheduledFor}. Read it over and change anything before it goes.`
          : undefined
      }
      footer={
        <>
          {preview?.testTo && (
            <button
              type="button"
              onClick={sendTest}
              disabled={testing || sending}
              title={`Send a copy to ${preview.testTo} only — the real recipients get nothing`}
              className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-fg transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              Send test to me
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-fg transition hover:border-line-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={() =>
              onSend({
                overrides: {
                  subject: subject.trim() || undefined,
                  to: recipients,
                  cc: splitEmails(cc),
                  paras: toParas(body),
                },
                deliverMode,
                // Already sent once? Then this is a deliberate resend.
                force: preview?.status === "sent",
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-[13px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {preview?.status === "sent" ? "Resend " : "Send "}
            {manual
              ? "me the copy"
              : `to the team (${recipients.length})`}
          </button>
        </>
      }
    >
      {loading && (
        <p className="flex items-center gap-2 py-8 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Composing the message…
        </p>
      )}

      {error && (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>
      )}

      {preview && !loading && (
        <div className="space-y-4">
          {/* Audience. The old flow hid this behind a per-reminder toggle
              on the calendar row, so "does this actually email the team?"
              could only be answered by knowing that setting existed. */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-elevated/60 p-1">
            {(
              [
                ["auto", "Send to the team now"],
                ["manual", "Just send me a copy"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setDeliverMode(m)}
                className={[
                  "flex-1 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  deliverMode === m
                    ? "bg-card-solid text-fg shadow-card-rest"
                    : "text-muted hover:text-fg",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Who actually receives this — the thing the old confirm hid. */}
          <div
            className={[
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed",
              manual
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-brand-200 bg-brand-50 text-brand-900",
            ].join(" ")}
          >
            {manual ? <UserCheck size={15} className="mt-0.5 shrink-0" /> : <Mail size={15} className="mt-0.5 shrink-0" />}
            <div>
              {manual ? (
                <>
                  <strong>Nothing goes to the team.</strong> Only you get a copy, at{" "}
                  <strong>{preview.deliverTo.join(", ") || "the coordinator"}</strong>, to forward by
                  hand. Switch to “Send to the team now” to have the platform deliver it.
                </>
              ) : (
                <>
                  <strong>The platform emails this to the recipients below</strong> the moment you
                  press send. Nothing to forward.
                </>
              )}
            </div>
          </div>

          {!preview.mailConfigured && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                Email isn’t configured on this platform (no SMTP). Sending will mark the reminder as
                skipped rather than deliver it.
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="To">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="name@example.com, other@example.com"
                className="w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-brand-400"
              />
            </Field>
            <Field label="Cc">
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="Leave empty for none"
                className="w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-brand-400"
              />
            </Field>
          </div>
          {invalid.length > 0 && (
            <p className="text-[12px] text-rose-600">
              Not a valid address: {invalid.join(", ")}
            </p>
          )}

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={300}
              className="w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-brand-400"
            />
          </Field>

          <Field label="Message" hint="One paragraph per block; blank line between. **bold** works.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              className="w-full resize-y rounded-md border border-line bg-card-solid px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none focus:border-brand-400"
            />
          </Field>

          {testNote && (
            <p
              className={[
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
                testNote.startsWith("Test sent")
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-rose-300 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              {testNote.startsWith("Test sent") ? (
                <Check size={14} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              )}
              {testNote}
            </p>
          )}

          {/* Send history — every real send, forward copy, and test. */}
          <div className="rounded-lg border border-line">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-[12.5px] text-muted transition hover:text-fg"
            >
              <History size={13} />
              {history.length === 0
                ? "Nothing sent yet"
                : `${history.length} send${history.length === 1 ? "" : "s"} so far`}
              <span className="ml-auto text-[11px] text-subtle">{showHistory ? "Hide" : "Show"}</span>
            </button>
            {showHistory && history.length > 0 && (
              <ul className="max-h-44 space-y-0.5 overflow-y-auto border-t border-line px-3 py-2">
                {history.map((h) => (
                  <li key={h.id} className="text-[11.5px] leading-relaxed">
                    <span
                      className={
                        h.status === "failed"
                          ? "font-semibold text-rose-600"
                          : h.mode === "test"
                            ? "font-semibold text-sky-700"
                            : "font-semibold text-emerald-700"
                      }
                    >
                      {h.status === "failed" ? "Failed" : MODE_LABEL[h.mode] ?? h.mode}
                    </span>
                    <span className="text-subtle">
                      {" · "}
                      {new Date(h.createdAt).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                      {h.sentByName ? ` · ${h.sentByName}` : ""}
                    </span>
                    <div className="text-subtle">
                      {h.error ? h.error : `→ ${h.sentTo.join(", ")}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
              Preview — including the schedule calendar
              <span className="ml-2 font-normal normal-case tracking-normal text-subtle">
                links open in a new tab
              </span>
            </p>
            <iframe
              // Links are rewritten to open in a new tab and the frame is
              // allowed to pop one, so the CTA can actually be tested from
              // here. Scripts and same-frame navigation stay blocked.
              srcDoc={html.replace(/<a\s/gi, '<a target="_blank" rel="noreferrer" ')}
              title="Email preview"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="h-[520px] w-full rounded-lg border border-line bg-white"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{label}</span>
      {hint && <span className="ml-2 text-[11px] normal-case tracking-normal text-subtle">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
