"use client";

/**
 * "Tell a colleague" — drop this on any admin page.
 *
 *     <NotifyPanel feature="speaker-intake" context={slug} />
 *
 * Everything else comes from the server: who can be picked, what the
 * email says, where its links point. The only thing this component
 * decides is who is ticked.
 *
 * The lists load when the panel is opened, not on page load — they are
 * uninteresting until somebody wants to send something.
 */
import { useCallback, useId, useState } from "react";
import {
  Check, ChevronDown, Loader2, Mail, Plus, Search, Send, Trash2, X,
} from "lucide-react";
import {
  splitAddresses,
  resolveRecipients,
  isEmail,
  MAX_NOTE_CHARS,
  MAX_RECIPIENTS,
} from "@/lib/notify/recipients";

interface Person { name: string; email: string; role: string | null }
interface Contact extends Person { id: string }
interface LinkOut { label: string; url: string; note: string; primary?: boolean }

interface Loaded {
  feature: { id: string; name: string; intro: string };
  links: LinkOut[];
  staff: Person[];
  contacts: Contact[];
}

export function NotifyPanel({
  feature,
  context,
  label = "Tell a colleague",
}: {
  feature: string;
  context?: string | null;
  label?: string;
}) {
  // Ids must be per-instance: two panels on one page would otherwise
  // share them, and clicking one label would focus the other's field.
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: string[]; failed: { email: string; reason: string }[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Address-book editor
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("");
  const [bookBusy, setBookBusy] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ feature });
      if (context) qs.set("context", context);
      const res = await fetch(`/api/admin/notify?${qs}`);
      const j = (await res.json().catch(() => ({}))) as Loaded & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't load the list.");
      setData(j);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [feature, context]);

  /*
   * The selection is keyed on the lowercased address, because the same
   * person can appear as Jane@x.com in their account and jane@x.com in
   * the address book. Keyed as typed, they tick twice and get two
   * copies of the same email.
   */
  function toggle(email: string) {
    const key = email.toLowerCase();
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const { ok: recipients, bad } = resolveRecipients([...picked, ...splitAddresses(extra)]);
  const overLimit = recipients.length > MAX_RECIPIENTS;
  const canSend = !sending && recipients.length > 0 && bad.length === 0 && !overLimit;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, context: context ?? null, recipients, note }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        sent?: string[]; failed?: { email: string; reason: string }[]; error?: string;
      };
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

  async function addContact() {
    if (bookBusy) return;
    setBookBusy(true);
    setBookError(null);
    try {
      const res = await fetch("/api/admin/notify/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const j = (await res.json().catch(() => ({}))) as { contact?: Contact; error?: string };
      if (!res.ok || !j.contact) throw new Error(j.error ?? "Couldn't add them.");
      setData((d) =>
        d
          ? {
              ...d,
              contacts: [...d.contacts, j.contact!].sort((a, b) => a.name.localeCompare(b.name)),
              // Somebody just moved from the staff list into the book.
              staff: d.staff.filter((s) => s.email.toLowerCase() !== j.contact!.email.toLowerCase()),
            }
          : d,
      );
      setNewName(""); setNewEmail(""); setNewRole(""); setAdding(false);
    } catch (e) {
      setBookError((e as Error).message);
    } finally {
      setBookBusy(false);
    }
  }

  async function removeContact(c: Contact) {
    setBookBusy(true);
    setBookError(null);
    try {
      const res = await fetch(`/api/admin/notify/contacts?id=${encodeURIComponent(c.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Couldn't remove them.");
      setPicked((p) => {
        const next = new Set(p);
        next.delete(c.email.toLowerCase());
        return next;
      });
      /*
       * Refetched rather than spliced. The server hides a staff member
       * from the staff list while they are in the address book, so
       * removing them from the book has to put them back — and only the
       * server knows whether they were staff to begin with. Filtering
       * locally made them vanish from both columns until a reload.
       */
      await load();
    } catch (e) {
      setBookError((e as Error).message);
    } finally {
      setBookBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // Loaded from the click, not from an effect: opening the panel
          // IS the event that wants the data, and an effect that fetches
          // has to re-derive that fact from state it can race with.
          if (!data && !loading) void load();
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] font-semibold text-fg transition hover:border-brand-400 hover:text-brand-700"
      >
        <Mail size={14} /> {label}
      </button>
    );
  }

  const q = filter.trim().toLowerCase();
  const match = (p: Person) =>
    !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) ||
    (p.role ?? "").toLowerCase().includes(q);

  const contacts = (data?.contacts ?? []).filter(match);
  const staff = (data?.staff ?? []).filter(match);

  const row = (p: Person, remove?: () => void) => {
    const on = picked.has(p.email.toLowerCase());
    return (
      <li key={p.email} className="flex items-center gap-1 pr-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2 transition hover:bg-elevated/60">
          <input
            type="checkbox"
            checked={on}
            onChange={() => toggle(p.email)}
            className="size-4 shrink-0 accent-brand-600"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold text-fg">{p.name}</span>
            <span className="block truncate text-[11px] text-muted">{p.email}</span>
          </span>
          {p.role && (
            <span className="hidden shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-fg-subtle sm:inline">
              {p.role}
            </span>
          )}
        </label>
        {remove && (
          <button
            type="button"
            onClick={remove}
            disabled={bookBusy}
            aria-label={`Remove ${p.name}`}
            title={`Remove ${p.name} from the list`}
            className="shrink-0 rounded p-1 text-muted transition hover:bg-elevated hover:text-red-600 disabled:opacity-40"
          >
            <Trash2 size={13} />
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-bold text-fg">{label}</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
            Each person gets their own email, addressed to them, with the links below.
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

      {/* What the email will carry — shown before it goes, not after. */}
      {data && (
        <div className="mt-3 rounded-lg bg-elevated/60 p-3">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex w-full items-center gap-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${showPreview ? "rotate-180" : ""}`}
            />
            What they will receive
          </button>
          {showPreview && (
            <div className="mt-2 space-y-2">
              <p className="text-[12px] leading-relaxed text-fg">{data.feature.intro}</p>
              {data.links.map((l) => (
                <div key={l.url} className="text-[11.5px]">
                  <span className="font-semibold text-fg">{l.label}</span>
                  <span className="block break-all text-muted">{l.url}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Who</span>
          {recipients.length > 0 && (
            <span className="text-[11px] font-semibold text-brand-700">
              {recipients.length} selected
            </span>
          )}
        </div>

        <div className="relative mt-1.5">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, email or role"
            aria-label="Filter people"
            className="w-full rounded-lg border border-line bg-card py-2 pl-8 pr-3 text-[12.5px] text-fg outline-none focus:border-brand-500"
          />
        </div>

        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
          {loading ? (
            <p className="flex items-center gap-2 p-3 text-[12px] text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </p>
          ) : !data ? (
            <p className="p-3 text-[12px] text-muted">—</p>
          ) : (
            <>
              {contacts.length > 0 && (
                <>
                  <p className="bg-elevated/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                    Saved list
                  </p>
                  <ul className="divide-y divide-line">
                    {contacts.map((c) => row(c, () => removeContact(c)))}
                  </ul>
                </>
              )}
              {staff.length > 0 && (
                <>
                  <p className="bg-elevated/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                    Platform staff
                  </p>
                  <ul className="divide-y divide-line">{staff.map((p) => row(p))}</ul>
                </>
              )}
              {contacts.length === 0 && staff.length === 0 && (
                <p className="p-3 text-[12px] text-muted">
                  {q ? "Nobody matches that." : "Nobody yet — add somebody below."}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Address book */}
      <div className="mt-2">
        {adding ? (
          <div className="rounded-lg border border-line p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (used in the greeting)"
                aria-label="Name"
                className="rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
              />
              <input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@example.com"
                aria-label="Email"
                className="rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
              />
            </div>
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Role or organisation (optional)"
              aria-label="Role"
              className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={addContact}
                disabled={bookBusy || newName.trim().length < 2 || !isEmail(newEmail)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
              >
                {bookBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Save to the list
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setBookError(null); }}
                className="text-[12px] font-semibold text-muted hover:text-fg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setAdding(true); setBookError(null); }}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-700 hover:text-brand-800"
          >
            <Plus size={13} /> Add somebody to the list
          </button>
        )}
        {/* Outside the add/collapsed branch: a delete failure used to be
            reported into a form that was not open, so nothing appeared. */}
        {bookError && <p className="mt-1.5 text-[11.5px] text-red-600">{bookError}</p>}
      </div>

      <div className="mt-3">
        <label htmlFor={`${uid}-extra`} className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Or just this once
        </label>
        <input
          id={`${uid}-extra`}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="name@example.com, another@example.com"
          className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
        />
        {bad.length > 0 && (
          <p className="mt-1 text-[11.5px] text-red-600">Not an email address: {bad.join(", ")}</p>
        )}
        {overLimit && (
          <p className="mt-1 text-[11.5px] text-red-600">
            That is {recipients.length} people — {MAX_RECIPIENTS} at a time is the limit.
          </p>
        )}
      </div>

      <div className="mt-3">
        <label htmlFor={`${uid}-note`} className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Add a line (optional)
        </label>
        <textarea
          id={`${uid}-note`}
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
              <Check size={13} className="mt-0.5 shrink-0" /> Sent to {result.sent.join(", ")}
            </p>
          )}
          {result.failed.map((f) => (
            <p key={f.email} className="text-[12px] text-red-600">{f.email} — {f.reason}</p>
          ))}
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {sending ? "Sending…" : recipients.length === 0 ? "Pick someone first" : `Send to ${recipients.length}`}
        </button>
      </div>
    </section>
  );
}
