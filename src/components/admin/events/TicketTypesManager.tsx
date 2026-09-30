"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, AlertCircle, Save } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface TicketTypeRow {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  capacity: number | null;
  isActive: boolean;
  displayOrder: number;
}

export function TicketTypesManager({
  slug,
  initial,
  stripeConfigured,
}: {
  slug: string;
  initial: TicketTypeRow[];
  stripeConfigured: boolean;
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketTypeRow[]>(initial);
  const [editing, setEditing] = useState<TicketTypeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function refresh() { router.refresh(); }

  async function deleteTicket(id: string, name: string) {
    if (!(await confirmDialog({
      title: `Delete the "${name}" ticket?`,
      description: "Existing registrations against it stay intact, but no new buyers can pick it.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    const res = await fetch(`/api/admin/events/${slug}/tickets/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTickets((ts) => ts.filter((t) => t.id !== id));
      refresh();
    }
  }

  if (creating || editing) {
    return (
      <TicketEditor
        slug={slug}
        initial={editing}
        onSave={(saved) => {
          if (editing) {
            setTickets((ts) => ts.map((t) => (t.id === saved.id ? saved : t)));
          } else {
            setTickets((ts) => [...ts, saved]);
          }
          setEditing(null);
          setCreating(false);
          refresh();
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {confirmNode}
      {/* Always-on activation banner. Paid public checkout is shipped
          in the schema + APIs but intentionally NOT wired into the
          public registration form yet (the form remains free-only).
          The team decision is to keep events free for now and
          activate paid checkout in a follow-up. Defining tiers here
          is fine — they just won't be surfaced to attendees until the
          activation lands. */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-xs text-fg inline-flex items-start gap-2.5">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-brand-700" />
        <div>
          <p className="font-bold text-brand-900">
            Paid checkout is queued — not active yet
          </p>
          <p className="mt-1 leading-snug text-fg-muted">
            All events run as <strong>free registration</strong> for now per team decision. Tiers
            defined on this page <strong>aren't surfaced to attendees yet</strong> — the public
            registration form still uses the free flow. The Stripe infrastructure (schema, APIs,
            webhook handler) is in place and dormant; flipping the activation switch is its own
            small follow-up. See <code className="font-mono bg-card-solid px-1 rounded">docs/event-roadmap.md</code>.
          </p>
        </div>
      </div>

      {!stripeConfigured && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 inline-flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>
            Separately: <strong>Stripe SDK is installed but env vars aren't set.</strong> When activation comes you'll also need <code className="font-mono">STRIPE_SECRET_KEY</code> and <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> on Vercel. Free ($0) tiers don't need either. See <code className="font-mono">docs/stripe-setup.md</code>.
          </span>
        </div>
      )}

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-muted">
          No ticket tiers yet. Add one to start charging for the event.
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-line bg-card p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm font-bold text-fg">{t.name}</p>
                  {!t.isActive && (
                    <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-fg-subtle bg-elevated px-1.5 py-0.5 rounded">
                      Hidden
                    </span>
                  )}
                </div>
                {t.description && <p className="text-xs text-muted mt-0.5">{t.description}</p>}
                <p className="text-xs text-fg-subtle mt-1">
                  Cap: {t.capacity ?? "unlimited"} · Order: {t.displayOrder}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-fg tabular-nums">
                  {t.priceCents === 0 ? "Free" : formatPrice(t.priceCents, t.currency)}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{t.currency}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-fg-muted hover:text-fg hover:bg-elevated"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteTicket(t.id, t.name)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 size={12} className="inline mr-1" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700"
      >
        <Plus size={14} />
        Add a tier
      </button>
    </div>
  );
}

function TicketEditor({
  slug, initial, onSave, onCancel,
}: {
  slug: string;
  initial: TicketTypeRow | null;
  onSave: (t: TicketTypeRow) => void;
  onCancel: () => void;
}) {
  const [name, setName]                 = useState(initial?.name ?? "");
  const [description, setDescription]   = useState(initial?.description ?? "");
  const [priceDollars, setPriceDollars] = useState(initial ? (initial.priceCents / 100).toFixed(2) : "0.00");
  const [currency, setCurrency]         = useState(initial?.currency ?? "CAD");
  const [capacity, setCapacity]         = useState<string>(initial?.capacity?.toString() ?? "");
  const [isActive, setIsActive]         = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const priceCents = Math.max(0, Math.round(parseFloat(priceDollars) * 100));
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      priceCents,
      currency,
      capacity: capacity.trim() ? parseInt(capacity, 10) : null,
      isActive,
    };
    const url = initial
      ? `/api/admin/events/${slug}/tickets/${initial.id}`
      : `/api/admin/events/${slug}/tickets`;
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.error ?? `Failed (${res.status})`);
      setSaving(false);
      return;
    }
    onSave(json.ticket);
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-card p-5 space-y-4 surface-shadow">
      <header>
        <h3 className="font-bold text-fg">{initial ? `Edit "${initial.name}"` : "New ticket tier"}</h3>
      </header>
      <Field label="Tier name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Standard"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Description (optional)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's included"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (in dollars)" hint="0.00 = free">
          <input
            type="number"
            min={0}
            step={0.01}
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
          >
            <option>CAD</option>
            <option>USD</option>
            <option>EUR</option>
            <option>GBP</option>
          </select>
        </Field>
      </div>
      <Field label="Capacity (optional)" hint="Per-tier cap. Leave blank to share the event-level cap.">
        <input
          type="number"
          min={1}
          step={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Unlimited"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
        />
      </Field>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <span className="text-sm">
          <span className="font-semibold text-fg">Active</span>
          <span className="text-xs text-muted ml-2">Hide a tier without deleting historical registrations</span>
        </span>
      </label>
      {error && (
        <div className="text-xs text-rose-700 inline-flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-fg-muted hover:text-fg hover:bg-elevated"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:bg-elevated disabled:text-subtle"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {initial ? "Save" : "Create tier"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</div>
      {children}
      {hint && <p className="text-xs text-subtle mt-1.5">{hint}</p>}
    </label>
  );
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
