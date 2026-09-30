"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, AlertCircle, User as UserIcon } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface HostRow {
  id: string;
  role: string;
  displayOrder: number;
  user: { id: string; name: string | null; email: string | null };
}

export function HostsManager({
  slug, initial,
}: {
  slug: string;
  initial: HostRow[];
}) {
  const router = useRouter();
  const [hosts, setHosts] = useState<HostRow[]>(initial);
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState("host");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function addHost(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/admin/events/${slug}/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: email.trim(), role: role.trim() || "host" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.error ?? `Failed (${res.status})`);
      setAdding(false);
      return;
    }
    setHosts((hs) => [...hs.filter((h) => h.id !== json.host.id), json.host]);
    setEmail("");
    setRole("host");
    setAdding(false);
    router.refresh();
  }

  async function removeHost(id: string, name: string | null) {
    if (!(await confirmDialog({ title: `Remove ${name ?? "this host"}?`, confirmLabel: "Remove", tone: "destructive" }))) return;
    setError(null);
    const res = await fetch(`/api/admin/events/${slug}/hosts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setHosts((hs) => hs.filter((h) => h.id !== id));
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(`Failed: ${json.error ?? res.status}`);
    }
  }

  return (
    <div className="space-y-5">
      {confirmNode}
      {hosts.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-muted">
          No hosts yet. Add one by email below.
        </div>
      ) : (
        <ul className="space-y-2">
          {hosts.map((h) => (
            <li
              key={h.id}
              className="rounded-xl border border-line bg-card p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                <UserIcon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-fg">
                  {h.user.name ?? <span className="italic text-muted">No name</span>}
                </p>
                <p className="text-xs text-muted">
                  <span className="font-mono">{h.user.email ?? "no email"}</span>
                  <span className="mx-1.5 text-fg-subtle">·</span>
                  <span className="capitalize">{h.role}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeHost(h.id, h.user.name)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 size={12} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addHost} className="rounded-2xl border border-line bg-card p-4 space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] font-bold text-fg-subtle">Add a host</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="bg-background border border-line rounded-lg px-3 py-2 text-sm"
            required
          />
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="host"
            className="bg-background border border-line rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-subtle">
          The email must match an existing platform user. Common role labels: <code className="font-mono bg-elevated px-1 rounded">host</code>, <code className="font-mono bg-elevated px-1 rounded">co-host</code>, <code className="font-mono bg-elevated px-1 rounded">moderator</code>.
        </p>
        {error && (
          <div className="text-xs text-rose-700 inline-flex items-center gap-1.5">
            <AlertCircle size={12} /> {error}
          </div>
        )}
        <button
          type="submit"
          disabled={adding || !email.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:bg-elevated disabled:text-subtle"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add host
        </button>
      </form>
    </div>
  );
}
