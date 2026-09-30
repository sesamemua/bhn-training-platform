"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface LtiConfig {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  authEndpoint: string;
  tokenEndpoint: string;
  jwksEndpoint: string;
  deploymentId: string;
  active: boolean;
  createdAt: Date;
}

const EMPTY_FORM = {
  name: "", issuer: "", clientId: "", authEndpoint: "",
  tokenEndpoint: "", jwksEndpoint: "", deploymentId: "", active: true,
};

export function LtiConfigClient({ configs: initial }: { configs: LtiConfig[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function set(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/admin/lti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShow(false);
    setForm({ ...EMPTY_FORM });
    router.refresh();
    setLoading(false);
  }

  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/admin/lti/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !current }),
    });
    router.refresh();
  }

  async function del(id: string) {
    if (!(await confirmDialog({ title: "Delete this LTI config?", confirmLabel: "Delete", tone: "destructive" }))) return;
    await fetch(`/api/admin/lti/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const fields = [
    { key: "issuer", label: "Issuer URL" },
    { key: "clientId", label: "Client ID" },
    { key: "authEndpoint", label: "Auth Endpoint" },
    { key: "tokenEndpoint", label: "Token Endpoint" },
    { key: "jwksEndpoint", label: "JWKS Endpoint" },
    { key: "deploymentId", label: "Deployment ID" },
  ];

  return (
    <div className="space-y-4">
      {confirmNode}
      <div className="flex justify-end">
        <button
          onClick={() => setShow(true)}
          className="bg-brand-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-700"
        >
          + Add LTI Platform
        </button>
      </div>

      <div className="space-y-3">
        {initial.map((cfg) => (
          <div key={cfg.id} className="bg-card rounded-xl border border-line overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-elevated"
              onClick={() => setExpanded(expanded === cfg.id ? null : cfg.id)}
            >
              <div className="flex items-center gap-3">
                <ChevronDown size={16} className={cn("text-subtle transition-transform", expanded !== cfg.id && "-rotate-90")} />
                <div>
                  <p className="font-semibold text-fg">{cfg.name}</p>
                  <p className="text-xs text-subtle">{cfg.issuer}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  cfg.active ? "bg-green-50 text-green-700" : "bg-raised text-muted"
                )}>
                  {cfg.active ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActive(cfg.id, cfg.active); }}
                  className="text-xs px-2 py-1 rounded border border-line hover:bg-elevated"
                >
                  {cfg.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); del(cfg.id); }}
                  className="text-subtle hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {expanded === cfg.id && (
              <div className="border-t border-line px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {fields.map((f) => (
                  <div key={f.key}>
                    <p className="text-xs text-subtle mb-0.5">{f.label}</p>
                    <p className="font-mono text-xs text-muted break-all">
                      {(cfg as unknown as Record<string, string>)[f.key]}
                    </p>
                  </div>
                ))}
                <div>
                  <p className="text-xs text-subtle mb-0.5">Added</p>
                  <p className="text-xs text-muted">{new Date(cfg.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </div>
        ))}
        {initial.length === 0 && (
          <div className="text-center py-12 text-subtle">No LTI platforms configured.</div>
        )}
      </div>

      {show && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-fg mb-4">Add LTI 1.3 Platform</h3>
            <form onSubmit={create} className="space-y-3">
              <input
                placeholder="Platform name *"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm"
              />
              {fields.map((f) => (
                <input
                  key={f.key}
                  placeholder={`${f.label} *`}
                  required
                  value={(form as Record<string, string | boolean>)[f.key] as string}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                />
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => set("active", e.target.checked)}
                  className="rounded"
                />
                Active immediately
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium"
                >
                  {loading ? "Saving…" : "Add Platform"}
                </button>
                <button type="button" onClick={() => setShow(false)} className="flex-1 border border-line rounded-lg py-2 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
