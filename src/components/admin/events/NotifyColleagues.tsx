"use client";

/**
 * "Tell a colleague" — pick staff, add a line, send them the speaker link.
 *
 * The list of colleagues is fetched only when the panel is opened. It is
 * every staff account on the platform and it is not interesting until
 * somebody actually wants to send something, so it does not belong in
 * the page's first paint.
 *
 * Nothing is sent until Send is pressed, and the exact links that will
 * go out are shown on screen first — an email you cannot read before it
 * leaves is one you have to send twice.
 */
import { useCallback, useState } from "react";
import { Check, Loader2, Mail, Search, Send, X } from "lucide-react";
import {
  splitAddresses,
  resolveRecipients,
  MAX_NOTE_CHARS,
  MAX_RECIPIENTS,
} from "@/lib/events/speaker-link-email";

interface Colleague {
  name: string;
  email: string;
  role: string;
}

interface Result {
  sent: string[];
  failed: { email: string; reason: string }[];
}


export function NotifyColleagues({
  slug,
  formUrl,
  adminUrl,
}: {
  slug: string;
  formUrl: string;
  adminUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [colleagues, setColleagues] = useState<Colleague[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${slug}/speakers/notify`);
      const j = (await res.json().catch(() => ({}))) as { colleagues?: Colleague[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load the staff list.");
      setColleagues(j.colleagues ?? []);
    } catch (e) {
      setError((e as Error).message);
      setColleagues([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  function toggle(email: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  // Same rule the route enforces, so nothing here is offered that the
  // server will then refuse.
  const { ok: recipients, bad: badTyped } = resolveRecipients([
    ...picked,
    ...splitAddresses(extra),
  ]);
  const overLimit = recipients.length > MAX_RECIPIENTS;

  async function send() {
    if (sending || recipients.length === 0 || badTyped.length > 0 || overLimit) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/events/${slug}/speakers/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, note }),
      });
      const j = (await res.json().catch(() => ({}))) as Result & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't send.");
      setResult({ sent: j.sent ?? [], failed: j.failed ?? [] });
      setPicked(new Set());
      setExtra("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const shown = (colleagues ?? []).filter((c) => {
    const q = filter.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (!colleagues) void load();
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] font-semibold text-fg transition hover:border-brand-400 hover:text-brand-700"
      >
        <Mail size={14} /> Tell a colleague
      </button>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-bold text-fg">Tell a colleague</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
            Sends them the speaker link and this page, so they can hand it out and see what
            comes back.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="shrink-0 text-muted transition hover:text-fg"
        >
          <X size={16} />
        </button>
      </div>

      {/* What will actually be in the email — shown before it goes, not after. */}
      <dl className="mt-3 space-y-1.5 rounded-lg bg-elevated/60 p-3 text-[11.5px]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-fg">Speaker form</dt>
          <dd className="break-all text-muted">{formUrl}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-fg">This admin page</dt>
          <dd className="break-all text-muted">{adminUrl}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="notify-filter" className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Colleagues
          </label>
          {recipients.length > 0 && (
            <span className="text-[11px] font-semibold text-brand-700">
              {recipients.length} selected
            </span>
          )}
        </div>

        <div className="relative mt-1.5">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="notify-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or email"
            className="w-full rounded-lg border border-line bg-card py-2 pl-8 pr-3 text-[12.5px] text-fg outline-none focus:border-brand-500"
          />
        </div>

        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">
          {loading ? (
            <p className="flex items-center gap-2 p-3 text-[12px] text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading staff…
            </p>
          ) : shown.length === 0 ? (
            <p className="p-3 text-[12px] text-muted">
              {colleagues === null
                ? "—"
                : filter.trim()
                  ? "Nobody matches that."
                  : "No other staff accounts yet — type an address below instead."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((c) => {
                const on = picked.has(c.email);
                return (
                  <li key={c.email}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition hover:bg-elevated/60">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.email)}
                        className="size-4 shrink-0 accent-brand-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-fg">{c.name}</span>
                        <span className="block truncate text-[11px] text-muted">{c.email}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                        {c.role}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="notify-extra" className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Anyone else
        </label>
        <input
          id="notify-extra"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="name@example.com, another@example.com"
          className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
        />
        {badTyped.length > 0 && (
          <p className="mt-1 text-[11.5px] text-red-600">
            Not an email address: {badTyped.join(", ")}
          </p>
        )}
        {overLimit && (
          <p className="mt-1 text-[11.5px] text-red-600">
            That is {recipients.length} people — {MAX_RECIPIENTS} at a time is the limit.
          </p>
        )}
      </div>

      <div className="mt-3">
        <label htmlFor="notify-note" className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Add a line (optional)
        </label>
        <textarea
          id="notify-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_CHARS))}
          rows={3}
          placeholder="Anything you want them to know."
          className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] leading-relaxed text-fg outline-none focus:border-brand-500"
        />
        <p className="mt-1 text-[11px] text-fg-subtle">{note.length} / {MAX_NOTE_CHARS}</p>
      </div>

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

      {result && (
        <div className="mt-2 space-y-1">
          {result.sent.length > 0 && (
            <p className="flex items-start gap-1.5 text-[12px] text-emerald-700">
              <Check size={13} className="mt-0.5 shrink-0" />
              Sent to {result.sent.join(", ")}
            </p>
          )}
          {result.failed.map((f) => (
            <p key={f.email} className="text-[12px] text-red-600">
              {f.email} — {f.reason}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={sending || recipients.length === 0 || badTyped.length > 0 || overLimit}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {sending
            ? "Sending…"
            : recipients.length === 0
              ? "Pick someone first"
              : `Send to ${recipients.length}`}
        </button>
      </div>
    </section>
  );
}
