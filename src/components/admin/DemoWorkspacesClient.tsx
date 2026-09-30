"use client";
/**
 * Admin UI for demo-workspace mint + active-demos panel.
 */
import { useEffect, useState } from "react";
import {
  Sparkles, Plus, Copy, CheckCircle2, AlertCircle, Trash2, Clock,
  ExternalLink, Building2, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Invite {
  id: string;
  token: string;
  email: string;
  companyName: string | null;
  companyWebsite: string | null;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  /** Friendly name (or email) of the admin who minted this link. */
  mintedBy: string | null;
}

interface Active {
  id: string;
  email: string;
  name: string | null;
  companyName: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  /** Friendly name (or email) of the admin who created this workspace. */
  createdBy: string | null;
}

interface Props {
  initialInvites: Invite[];
  initialActive: Active[];
}

export function DemoWorkspacesClient({ initialInvites, initialActive }: Props) {
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [active, setActive] = useState<Active[]>(initialActive);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", companyName: "", companyWebsite: "", days: 7 });
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  // Multi-select state for the bulk-delete action. Sets keep the
  // membership-check fast even at the page's 50-row hard cap.
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(() => new Set());
  const [selectedActive, setSelectedActive] = useState<Set<string>>(() => new Set());

  function toggleInvite(id: string) {
    setSelectedInvites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleActive(id: string) {
    setSelectedActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllInvites() {
    setSelectedInvites((prev) => prev.size === invites.length ? new Set() : new Set(invites.map((i) => i.id)));
  }
  function toggleAllActive() {
    setSelectedActive((prev) => prev.size === active.length ? new Set() : new Set(active.map((a) => a.id)));
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/employer/demo/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {/* ignore */});
  }

  async function mint(payload?: typeof form) {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/demo-workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? form),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Mint failed"); return; }
      setInvites((cur) => [{
        id: j.invite.id,
        token: j.invite.token,
        email: j.invite.email,
        companyName: j.invite.companyName,
        companyWebsite: (payload ?? form).companyWebsite || null,
        expiresAt: j.invite.expiresAt,
        createdAt: new Date().toISOString(),
        usedAt: null,
        mintedBy: j.invite.mintedBy ?? null,
      }, ...cur]);
      setForm({ email: "", companyName: "", companyWebsite: "", days: 7 });
      setCreating(false);
      // Auto-copy the new link to clipboard for instant sharing
      copyLink(j.invite.token);
    } finally { setBusy(false); }
  }

  async function quickMint() {
    // Mint with no inputs — server fills sensible defaults.
    await mint({ email: "", companyName: "", companyWebsite: "", days: 7 });
  }

  async function endDemo(employerId: string) {
    if (!(await confirmDialog({ title: "End this demo workspace now?", description: "The visitor's data will be deleted.", confirmLabel: "End demo", tone: "destructive" }))) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/demo-workspaces?employerId=${employerId}`, { method: "DELETE" });
      if (r.ok) setActive((cur) => cur.filter((a) => a.id !== employerId));
    } finally { setBusy(false); }
  }

  async function sweep() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/demo-workspaces", { method: "PATCH" });
      if (r.ok) {
        const j = await r.json();
        if (j.deleted > 0) {
          setActive((cur) => cur.filter((a) => !a.expiresAt || new Date(a.expiresAt) > new Date()));
        }
      }
    } finally { setBusy(false); }
  }

  // Nuke every demo workspace + every demo invite. Wipes both
  // server-side and the local lists so the UI is immediately
  // empty. Aligns with the platform convention for demo-data
  // buttons: no confirm prompt; demo data is throwaway by
  // construction.
  async function clearAll() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/demo-workspaces?all=true", { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Couldn't clear.");
        return;
      }
      setActive([]);
      setInvites([]);
      setSelectedActive(new Set());
      setSelectedInvites(new Set());
    } finally { setBusy(false); }
  }

  // Bulk-delete the rows the admin has ticked. Calls the
  // /api/admin/demo-workspaces/bulk-delete endpoint, then prunes
  // both local lists by the ids that were sent. Resets selection.
  async function deleteSelected() {
    if (selectedInvites.size === 0 && selectedActive.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/demo-workspaces/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerIds: Array.from(selectedActive),
          inviteIds:   Array.from(selectedInvites),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Couldn't delete selected.");
        return;
      }
      setActive((cur) => cur.filter((a) => !selectedActive.has(a.id)));
      setInvites((cur) => cur.filter((i) => !selectedInvites.has(i.id)));
      setSelectedActive(new Set());
      setSelectedInvites(new Set());
    } finally { setBusy(false); }
  }

  const totalSelected = selectedInvites.size + selectedActive.size;

  return (
    <div className="space-y-6">
      {confirmNode}
      {/* Mint CTA */}
      <section className="bg-card border border-line rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-fg">Mint a demo link</h2>
            <p className="text-xs text-muted mt-0.5">Click-to-sign-in URL — no claim form, no credentials, no setup. Reusable until expiry.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={quickMint}
              disabled={busy}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1.5"
              title="Mint a generic link — no inputs needed. Auto-copies to clipboard."
            >
              <Sparkles size={12} /> Quick demo (auto-copy)
            </button>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 inline-flex items-center gap-1.5"
              >
                <Plus size={12} /> Customise
              </button>
            )}
          </div>
        </div>

        {creating && (
          <div className="bg-elevated/40 border border-line rounded-xl p-4 space-y-3 animate-fade-in">
            <p className="text-xs text-muted">All fields optional — leave blank for sensible defaults.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Visitor email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputCls}
                  placeholder="jane@partner-company.com (optional)"
                />
              </Field>
              <Field label="Company name">
                <input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className={inputCls}
                  placeholder="Partner Biotech Inc (optional)"
                />
              </Field>
              <Field label="Company website">
                <input
                  value={form.companyWebsite}
                  onChange={(e) => setForm({ ...form, companyWebsite: e.target.value })}
                  className={inputCls}
                  placeholder="https://partner-co.com (optional)"
                />
              </Field>
              <Field label="Demo lifetime (days)">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.days}
                  onChange={(e) => setForm({ ...form, days: Math.max(1, Math.min(30, Number(e.target.value) || 7)) })}
                  className={inputCls}
                />
              </Field>
            </div>
            {err && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                <AlertCircle size={12} /> {err}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs px-3 py-2 rounded-lg text-muted hover:bg-elevated">Cancel</button>
              <button onClick={() => mint()} disabled={busy} className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5">
                <Sparkles size={12} /> Mint
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Sticky bulk-delete bar — appears once any rows are ticked.
          Single button collapses the two parallel lists (links +
          active workspaces) into one "delete selected" action. */}
      {totalSelected > 0 && (
        <div className="sticky top-2 z-30 rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap shadow-md shadow-rose-900/5">
          <p className="text-sm text-rose-900 font-semibold">
            {totalSelected} selected
            <span className="text-xs font-normal text-rose-800/80 ml-2">
              {selectedInvites.size > 0 && `${selectedInvites.size} link${selectedInvites.size === 1 ? "" : "s"}`}
              {selectedInvites.size > 0 && selectedActive.size > 0 && " · "}
              {selectedActive.size > 0 && `${selectedActive.size} workspace${selectedActive.size === 1 ? "" : "s"}`}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedInvites(new Set()); setSelectedActive(new Set()); }}
              disabled={busy}
              className="text-xs font-medium px-3 py-1.5 rounded-md text-rose-800 hover:bg-rose-100"
            >
              Clear selection
            </button>
            <button
              onClick={deleteSelected}
              disabled={busy}
              className="admin-glow text-xs font-bold px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 size={11} /> Delete selected
            </button>
          </div>
        </div>
      )}

      {/* Demo links (claimed and not) — magic links are reusable, so
          everything stays here until expiry. */}
      {invites.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold">
              Demo links · {invites.length}
            </p>
            <label className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedInvites.size === invites.length && invites.length > 0}
                onChange={toggleAllInvites}
                className="accent-rose-600"
              />
              Select all
            </label>
          </div>
          <div className="space-y-2">
            {invites.map((i) => (
              <DemoLinkCard
                key={i.id}
                invite={i}
                copied={copied === i.token}
                onCopy={() => copyLink(i.token)}
                checked={selectedInvites.has(i.id)}
                onToggle={() => toggleInvite(i.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Active demos */}
      <section>
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold">
              Active demos · {active.length}
            </p>
            {active.length > 0 && (
              <label className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedActive.size === active.length && active.length > 0}
                  onChange={toggleAllActive}
                  className="accent-rose-600"
                />
                Select all
              </label>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={sweep}
              disabled={busy}
              className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1"
              title="Delete only the workspaces whose lifetime has expired."
            >
              <Trash2 size={11} /> Run cleanup sweeper
            </button>
            {(active.length > 0 || invites.length > 0) && (
              <button
                onClick={clearAll}
                disabled={busy}
                className="admin-glow text-[11px] font-semibold text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 px-2.5 py-1 rounded-md inline-flex items-center gap-1 disabled:opacity-50"
                title="Delete every demo workspace + every demo invite. Real accounts and partner data are not touched."
              >
                <Trash2 size={11} /> Clear all demos
              </button>
            )}
          </div>
        </div>
        {active.length === 0 ? (
          <div className="bg-card border border-line rounded-xl p-8 text-center text-sm text-muted">
            No demos in flight. Mint one above when a prospect is ready.
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((a) => {
              const expiresIn = a.expiresAt ? Math.max(0, Math.floor((new Date(a.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000))) : 0;
              const checked = selectedActive.has(a.id);
              return (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-xl border p-4 flex items-center gap-3 flex-wrap transition-colors",
                    checked
                      ? "bg-rose-50/50 border-rose-200"
                      : "bg-card border-line",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleActive(a.id)}
                    className="accent-rose-600 shrink-0"
                    aria-label={`Select ${a.companyName ?? a.email}`}
                  />
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <User size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-fg truncate">{a.companyName ?? a.name ?? a.email}</p>
                    <p className="text-xs text-muted truncate">{a.email}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {a.createdBy && (
                        <p className="text-[11px] text-subtle inline-flex items-center gap-1">
                          <User size={10} /> created by {a.createdBy}
                        </p>
                      )}
                      {a.lastLoginAt && (
                        <p className="text-[11px] text-subtle">last sign-in {new Date(a.lastLoginAt).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-subtle inline-flex items-center gap-1 shrink-0">
                    <Clock size={11} /> {expiresIn > 0 ? `${expiresIn}d left` : "expired"}
                  </p>
                  <button
                    onClick={() => endDemo(a.id)}
                    disabled={busy}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Trash2 size={12} /> End demo
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DemoLinkCard({
  invite, copied, onCopy, checked, onToggle,
}: {
  invite: Invite;
  copied: boolean;
  onCopy: () => void;
  checked: boolean;
  onToggle: () => void;
}) {
  // The full URL the admin would paste somewhere. Built on the client
  // (window.location.origin isn't available during SSR) so it picks
  // up the right origin (localhost, preview, production) automatically.
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    setUrl(`${window.location.origin}/employer/demo/${invite.token}`);
  }, [invite.token]);
  const expiresIn = Math.max(0, Math.floor((new Date(invite.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)));
  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      checked ? "bg-rose-50/50 border-rose-200" : "bg-card border-line",
    )}>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-rose-600 shrink-0"
          aria-label={`Select demo link for ${invite.companyName ?? invite.email}`}
        />
        <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
          <Building2 size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-fg truncate">{invite.companyName ?? invite.email}</p>
            {invite.usedAt ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                claimed
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                unclaimed
              </span>
            )}
          </div>
          <p className="text-xs text-muted truncate">{invite.email}</p>
          {invite.mintedBy && (
            <p className="text-[11px] text-subtle mt-0.5 inline-flex items-center gap-1">
              <User size={10} /> minted by {invite.mintedBy}
            </p>
          )}
        </div>
        <p className="text-[11px] text-subtle inline-flex items-center gap-1 shrink-0">
          <Clock size={11} /> {expiresIn > 0 ? `${expiresIn}d left` : "expires today"}
        </p>
      </div>

      {/* The actual URL — visible, selectable, and copyable as many
          times as the admin wants. The button is a convenience; the
          input is the source of truth. */}
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 font-mono text-xs bg-elevated/40 border border-line rounded-md px-2.5 py-1.5 text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 select-all min-w-0"
        />
        <button
          onClick={onCopy}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 inline-flex items-center gap-1.5 shrink-0"
        >
          {copied ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={url || "#"}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-elevated hover:text-fg inline-flex items-center gap-1.5 shrink-0"
          title="Open the demo in a new tab to test"
        >
          <ExternalLink size={12} /> Test
        </a>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500";
