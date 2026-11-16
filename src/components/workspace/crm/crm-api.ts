/** Client helper for POST /api/workspace/outreach/crm. */
export async function crmPost<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch("/api/workspace/outreach/crm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  }).catch(() => null);
  const data = ((await res?.json().catch(() => ({}))) ?? {}) as T & { error?: string };
  if (!res) return { ok: false, data: { error: "Couldn't reach the server — check your connection." } as T & { error?: string } };
  return { ok: res.ok, data };
}

export const inputCls = "rounded-md border border-line bg-card-solid px-2 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-400";
export const btnCls = "inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated disabled:opacity-50";
export const primaryCls = "inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50";
export const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "—");
