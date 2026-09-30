"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, Copy, Check, Trash2, AlertCircle, Mail, Building2,
  Sparkles, ExternalLink, Clock, Search, X, Eye, Undo2, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInputDialog } from "@/components/ui/InputDialog";

interface Invite {
  id: string;
  email: string;
  token: string;
  companyName: string | null;
  companyWebsite: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  openCount: number;
  lastOpenedAt: string | null;
}

type StatusFilter = "all" | "pending" | "claimed" | "expired";

const TEST_EMAIL_RE = /@biohubnet\.test$/i;

export function EmployerInvitesAdmin({ initial }: { initial: Invite[] }) {
  const router = useRouter();
  const { inputDialog, node: inputNode } = useInputDialog();
  const [invites, setInvites] = useState<Invite[]>(initial);
  const [form, setForm] = useState({
    email: "", companyName: "", companyWebsite: "", expiresInDays: 14,
  });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter / search
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Pending revocations — undoable for 5 seconds before the API
  // call actually fires.
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; email: string } | null>(null);
  const revokeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );
  function linkFor(token: string) { return `${origin}/signup/employer/${token}`; }

  // Filtered + searched
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invites.filter((i) => {
      const used = !!i.usedAt;
      const expired = !used && new Date(i.expiresAt) < new Date();
      if (filter === "pending" && (used || expired)) return false;
      if (filter === "claimed" && !used) return false;
      if (filter === "expired" && !expired) return false;
      if (!q) return true;
      return (
        i.email.toLowerCase().includes(q) ||
        (i.companyName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [invites, query, filter]);

  const counts = useMemo(() => {
    let pending = 0, claimed = 0, expired = 0;
    for (const i of invites) {
      if (i.usedAt) claimed++;
      else if (new Date(i.expiresAt) < new Date()) expired++;
      else pending++;
    }
    return { all: invites.length, pending, claimed, expired };
  }, [invites]);

  async function create(payload?: typeof form) {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/employer-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? form),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; invite?: Invite; error?: string;
      };
      if (!res.ok || !j.invite) {
        setError(j.error ?? "Couldn't create invite.");
        return null;
      }
      // Server may have omitted the new fields if it returned the row
      // pre-update; default them defensively.
      const inv: Invite = {
        ...j.invite,
        openCount: j.invite.openCount ?? 0,
        lastOpenedAt: j.invite.lastOpenedAt ?? null,
      };
      setInvites((cur) => [inv, ...cur]);
      setForm({ email: "", companyName: "", companyWebsite: "", expiresInDays: 14 });
      setShowForm(false);
      setJustCreated(inv.id);
      router.refresh();
      return inv;
    } finally {
      setCreating(false);
    }
  }

  async function quickInvite() {
    const created = await create({ email: "", companyName: "", companyWebsite: "", expiresInDays: 14 });
    if (created) {
      try {
        await navigator.clipboard.writeText(linkFor(created.token));
        setCopiedId(created.id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        await inputDialog({ title: "Copy link", defaultValue: linkFor(created.token), confirmLabel: "Done", maxLength: 2000 });
      }
    }
  }

  async function copyLink(invite: Invite) {
    try {
      await navigator.clipboard.writeText(linkFor(invite.token));
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      await inputDialog({ title: "Copy link", defaultValue: linkFor(invite.token), confirmLabel: "Done", maxLength: 2000 });
    }
  }

  // Revocation with 5-second client-side undo
  function startRevoke(invite: Invite) {
    if (pendingRevoke && revokeTimer.current) {
      clearTimeout(revokeTimer.current);
      // Restore the previously-pending one
      setInvites((cur) => {
        const exists = cur.find((c) => c.id === pendingRevoke.id);
        if (exists) return cur;
        return cur;
      });
    }
    setPendingRevoke({ id: invite.id, email: invite.email });
    setInvites((cur) => cur.filter((i) => i.id !== invite.id));
    revokeTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/admin/employer-invites/${invite.id}`, { method: "DELETE" });
      } finally {
        setPendingRevoke((cur) => (cur?.id === invite.id ? null : cur));
        revokeTimer.current = null;
        router.refresh();
      }
    }, 5000);
  }
  function undoRevoke() {
    if (!pendingRevoke) return;
    if (revokeTimer.current) clearTimeout(revokeTimer.current);
    revokeTimer.current = null;
    // Restore the row from the original initial list (if still in scope)
    // Since we only moved it out of state, we need to re-fetch or push back.
    // Safest: refresh to re-source from the server (still has the row).
    router.refresh();
    setPendingRevoke(null);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {inputNode}
      {/* Issue invite */}
      <section className="bg-card border border-line rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-fg">Issue an invite</h2>
            <p className="text-xs text-muted mt-0.5">Magic-link sign-in — recipient clicks the URL and lands in /employer. No claim form.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={quickInvite}
              disabled={creating}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white border border-emerald-700 hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1.5"
              title="Mint a generic invite (placeholder email) for testing. Auto-copies the link."
            >
              <Sparkles size={12} /> Quick invite
            </button>
            {!showForm && !bulkOpen && (
              <>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 inline-flex items-center gap-1.5"
                >
                  <Plus size={12} /> Customise
                </button>
                <button
                  type="button"
                  onClick={() => setBulkOpen(true)}
                  className="text-xs font-semibold px-3 py-2 rounded-lg bg-card-solid border border-line text-muted hover:text-fg inline-flex items-center gap-1.5"
                  title="Paste a list of emails — one per line"
                >
                  <ListChecks size={12} /> Bulk
                </button>
              </>
            )}
          </div>
        </div>

        {showForm && (
          <CustomiseForm
            form={form}
            setForm={setForm}
            onCancel={() => setShowForm(false)}
            onCreate={() => create()}
            creating={creating}
            error={error}
          />
        )}
        {bulkOpen && (
          <BulkInviteForm
            onClose={() => setBulkOpen(false)}
            onMinted={(newInvites) => {
              setInvites((cur) => [...newInvites, ...cur]);
              setBulkOpen(false);
              if (newInvites[0]) setJustCreated(newInvites[0].id);
              router.refresh();
            }}
          />
        )}
      </section>

      {/* Filter + search */}
      {invites.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email or company…"
              className="w-full pl-9 pr-3 py-2 bg-card-solid border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-subtle hover:text-fg"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <FilterChip active={filter === "all"}     onClick={() => setFilter("all")}     label={`All ${counts.all}`} />
          <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")} label={`Pending ${counts.pending}`} tone="amber" />
          <FilterChip active={filter === "claimed"} onClick={() => setFilter("claimed")} label={`Claimed ${counts.claimed}`} tone="emerald" />
          <FilterChip active={filter === "expired"} onClick={() => setFilter("expired")} label={`Expired ${counts.expired}`} tone="muted" />
        </div>
      )}

      {/* Invites list */}
      <section>
        {invites.length === 0 ? (
          <div className="bg-card border border-line rounded-xl p-12 text-center text-sm text-muted">
            No invites issued yet. Quick-invite above to spin one up in a click.
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-card border border-line rounded-xl p-8 text-center text-sm text-muted">
            No invites match your filter.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((i) => (
              <InviteCard
                key={i.id}
                invite={i}
                origin={origin}
                copied={copiedId === i.id}
                highlight={justCreated === i.id}
                onCopy={() => copyLink(i)}
                onRevoke={() => startRevoke(i)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="bg-card-solid border border-line rounded-lg p-3 text-xs text-muted space-y-1">
        <p className="font-semibold text-fg">A few notes on testing</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Open the <strong>Test</strong> link in an incognito / private window — clicking it normally would replace your admin session with the employer one (same browser shares cookies).</li>
          <li>Magic links are reusable until expiry, so the same partner can return as a bookmark.</li>
          <li>Quick invites use placeholder <code className="font-mono text-[11px] bg-elevated px-1 rounded">@biohubnet.test</code> emails — fine for clicking through the flow yourself, but hand out Customise / Bulk invites for real prospects.</li>
          <li>Outbound email isn&apos;t wired yet — copy the URL and send via Slack / Gmail / your usual channel.</li>
        </ul>
      </div>

      {/* Undo toast */}
      {pendingRevoke && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card-solid border border-line shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 animate-fade-in">
          <Trash2 size={14} className="text-rose-600" />
          <p className="text-sm text-fg">
            Revoked invite for <strong>{pendingRevoke.email}</strong>
          </p>
          <button
            onClick={undoRevoke}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-1"
          >
            <Undo2 size={11} /> Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Customise form ───────────────────────────────────────────────
function CustomiseForm({
  form, setForm, onCancel, onCreate, creating, error,
}: {
  form: { email: string; companyName: string; companyWebsite: string; expiresInDays: number };
  setForm: React.Dispatch<React.SetStateAction<{ email: string; companyName: string; companyWebsite: string; expiresInDays: number }>>;
  onCancel: () => void;
  onCreate: () => void;
  creating: boolean;
  error: string | null;
}) {
  return (
    <div className="bg-elevated/40 border border-line rounded-xl p-4 space-y-3 animate-fade-in">
      <p className="text-xs text-muted">All fields optional — leave blank for defaults. Use these when sending to a real prospect.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Recipient email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((cur) => ({ ...cur, email: e.target.value }))}
            placeholder="contact@partner.com (optional)"
            className={inputClass}
          />
        </Field>
        <Field label="Expires in (days)">
          <input
            type="number" min={1} max={60}
            value={form.expiresInDays}
            onChange={(e) => setForm((cur) => ({ ...cur, expiresInDays: parseInt(e.target.value) || 14 }))}
            className={inputClass}
          />
        </Field>
        <Field label="Company name">
          <input
            value={form.companyName}
            onChange={(e) => setForm((cur) => ({ ...cur, companyName: e.target.value }))}
            placeholder="Acme Biotherapeutics (optional)"
            className={inputClass}
          />
        </Field>
        <Field label="Company website">
          <input
            value={form.companyWebsite}
            onChange={(e) => setForm((cur) => ({ ...cur, companyWebsite: e.target.value }))}
            placeholder="acme-bio.com (optional)"
            className={inputClass}
          />
        </Field>
      </div>
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-2 rounded-lg text-muted hover:bg-elevated">Cancel</button>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create
        </button>
      </div>
    </div>
  );
}

// ── Bulk-invite form ─────────────────────────────────────────────
function BulkInviteForm({
  onClose, onMinted,
}: {
  onClose: () => void;
  onMinted: (rows: Invite[]) => void;
}) {
  const [emails, setEmails] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ minted: number; invalid: number; failed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setReport(null);
    const sample = emails.split(/[\s,;]+/).filter(Boolean);
    if (sample.length === 0) { setErr("Paste at least one email."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/employer-invites/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, companyName, expiresInDays: days }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean; minted?: number; invalid?: number; failed?: number;
        results?: { email: string; ok: boolean; reason?: string; inviteId?: string; token?: string }[];
        error?: string;
      };
      if (!r.ok) { setErr(j.error ?? "Bulk mint failed"); return; }
      setReport({ minted: j.minted ?? 0, invalid: j.invalid ?? 0, failed: j.failed ?? 0 });
      // Re-fetch the issued list to get the canonical rows.
      const listRes = await fetch("/api/admin/employer-invites");
      if (listRes.ok) {
        const list = (await listRes.json()) as { invites: Invite[] };
        // Pick out the just-created rows by inviteId for highlight.
        const newIds = new Set((j.results ?? []).filter((x) => x.ok && x.inviteId).map((x) => x.inviteId!));
        const justNew = list.invites.filter((i) => newIds.has(i.id));
        onMinted(justNew);
      } else {
        onClose();
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-elevated/40 border border-line rounded-xl p-4 space-y-3 animate-fade-in">
      <p className="text-xs text-muted">Paste up to 100 emails — one per line, or comma/semicolon separated. We&apos;ll mint a magic-link invite per address.</p>
      <textarea
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        rows={5}
        placeholder={"jane@partnerco.com\njohn@partnerco.com\nqa@partnerco.com"}
        className={inputClass + " resize-y font-mono text-xs"}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Company name (applies to all)">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="PartnerCo (optional)"
            className={inputClass}
          />
        </Field>
        <Field label="Expires in (days)">
          <input
            type="number" min={1} max={60}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value) || 14)}
            className={inputClass}
          />
        </Field>
      </div>
      {err && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}
      {report && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
          <Check size={13} className="mt-0.5 shrink-0" />
          <span>
            Minted <strong>{report.minted}</strong>
            {report.invalid > 0 && <> · skipped {report.invalid} malformed</>}
            {report.failed > 0  && <> · {report.failed} failed</>}
          </span>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg text-muted hover:bg-elevated">Cancel</button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <ListChecks size={12} />}
          Mint
        </button>
      </div>
    </div>
  );
}

// ── Filter chip ──────────────────────────────────────────────────
function FilterChip({ active, onClick, label, tone }: { active: boolean; onClick: () => void; label: string; tone?: "amber" | "emerald" | "muted" }) {
  const activeCls =
    tone === "amber"   ? "bg-amber-50 text-amber-800 border-amber-200"
  : tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
  : tone === "muted"   ? "bg-elevated text-muted border-line"
                       : "bg-brand-50 text-brand-700 border-brand-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
        active ? activeCls : "bg-card-solid border-line text-muted hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

// ── Invite card ──────────────────────────────────────────────────
function InviteCard({
  invite, origin, copied, highlight, onCopy, onRevoke,
}: {
  invite: Invite;
  origin: string;
  copied: boolean;
  highlight: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const [url, setUrl] = useState(origin ? `${origin}/signup/employer/${invite.token}` : "");
  useEffect(() => {
    setUrl(`${window.location.origin}/signup/employer/${invite.token}`);
  }, [invite.token]);

  const used = !!invite.usedAt;
  const expired = !used && new Date(invite.expiresAt) < new Date();
  const expiresIn = Math.max(0, Math.floor((new Date(invite.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)));
  const dead = expired;
  const isTesting = TEST_EMAIL_RE.test(invite.email);

  return (
    <div
      className={cn(
        "bg-card border rounded-xl p-4 space-y-3 transition-colors",
        highlight ? "border-brand-300 ring-1 ring-brand-200" : "border-line",
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          <Building2 size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-fg truncate">{invite.companyName ?? invite.email}</p>
            {used ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                claimed
              </span>
            ) : expired ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-elevated text-subtle border border-line">
                expired
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                pending
              </span>
            )}
            {isTesting && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200" title="Quick invite — placeholder email, intended for admin testing only">
                testing
              </span>
            )}
          </div>
          <p className="text-xs text-muted truncate inline-flex items-center gap-1">
            <Mail size={11} /> {invite.email}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {invite.openCount > 0 && (
            <p className="text-[11px] text-subtle inline-flex items-center gap-1" title={invite.lastOpenedAt ? `Last opened ${new Date(invite.lastOpenedAt).toLocaleString()}` : ""}>
              <Eye size={11} /> {invite.openCount} open{invite.openCount === 1 ? "" : "s"}
            </p>
          )}
          <p className="text-[11px] text-subtle inline-flex items-center gap-1">
            <Clock size={11} />
            {expired ? "expired" : expiresIn === 0 ? "today" : `${expiresIn}d left`}
          </p>
        </div>
      </div>

      {!dead && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="flex-1 font-mono text-xs bg-elevated/40 border border-line rounded-md px-2.5 py-1.5 text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/30 select-all min-w-0"
          />
          <button
            type="button"
            onClick={onCopy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 inline-flex items-center gap-1.5 shrink-0"
            title="Copy magic-link URL"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-elevated hover:text-fg inline-flex items-center gap-1.5 shrink-0"
            title="Open the magic link in a new tab — same experience the recipient sees. Tip: use an incognito window so it doesn't replace your admin session."
          >
            <ExternalLink size={12} /> Test
          </a>
          {!used && (
            <button
              type="button"
              onClick={onRevoke}
              className="text-xs text-subtle hover:text-rose-600 p-1.5 rounded shrink-0"
              title="Revoke (5s undo)"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500";

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1.5">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
