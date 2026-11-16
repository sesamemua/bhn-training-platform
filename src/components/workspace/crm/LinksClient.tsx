"use client";

import { useState } from "react";
import { Check, Copy, Link2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { cn } from "@/lib/utils";
import { buildUtmUrl } from "@/lib/outreach/crm";
import { crmPost, fmtDay, inputCls, primaryCls } from "./crm-api";

export interface LinkRow { id: string; slug: string; label: string; url: string; clicks: number; lastAt: string | null; byName: string; createdAt: string }

const MEDIUMS = ["email", "social", "newsletter", "paid", "referral", "print", "qr"];

export function LinksClient({ initial, origin }: { initial: LinkRow[]; origin: string }) {
  const [links, setLinks] = useState(initial);
  const [f, setF] = useState({ label: "", url: "https://", source: "", medium: "email", campaign: "", content: "" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const preview = buildUtmUrl(f);

  async function create() {
    const { ok, data } = await crmPost<{ link: LinkRow & { createdAt: string } }>("link.create", f);
    if (!ok) { setError(data.error ?? "Couldn't make that link."); return; }
    setError(null);
    setLinks((l) => [data.link, ...l]);
    setF((x) => ({ ...x, label: "", content: "" }));
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id); setTimeout(() => setCopied(null), 1500);
  }

  const short = (slug: string) => `${origin.replace(/\/$/, "")}/go/${slug}`;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-fg">Build a tracked link</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[11px] font-semibold text-muted sm:col-span-2 lg:col-span-3">Destination
            <input id="link-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className={cn(inputCls, "mt-1 w-full")} />
          </label>
          <label className="text-[11px] font-semibold text-muted">Source (where it's posted)
            <input id="link-source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="linkedin, obio-newsletter…" className={cn(inputCls, "mt-1 w-full")} />
          </label>
          <label className="text-[11px] font-semibold text-muted">Medium
            <select id="link-medium" value={f.medium} onChange={(e) => setF({ ...f, medium: e.target.value })} className={cn(inputCls, "mt-1 w-full")}>
              {MEDIUMS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-muted">Campaign
            <input id="link-campaign" value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })} placeholder="symposium-2026" className={cn(inputCls, "mt-1 w-full")} />
          </label>
          <label className="text-[11px] font-semibold text-muted">Content (optional, to tell versions apart)
            <input id="link-content" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="banner-a" className={cn(inputCls, "mt-1 w-full")} />
          </label>
          <label className="text-[11px] font-semibold text-muted sm:col-span-2">Name (for this list)
            <input id="link-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="LinkedIn post · 12 Nov" className={cn(inputCls, "mt-1 w-full")} />
          </label>
        </div>
        <p className="break-all rounded-md bg-elevated/50 px-2.5 py-1.5 font-mono text-[11px] text-muted">{preview ?? "Enter a full https:// address."}</p>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <button type="button" disabled={!preview || !f.source || !f.campaign} onClick={create} className={primaryCls}><Plus size={12} /> Create short link</button>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-subtle">
            <tr><th className="px-3 py-2.5 font-bold">Link</th><th className="px-3 py-2.5 text-right font-bold">Clicks</th><th className="px-3 py-2.5 font-bold">Last click</th><th className="px-3 py-2.5 font-bold">Made by</th><th className="px-3 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {links.map((l) => (
              <tr key={l.id} className="group">
                <td className="max-w-[28rem] px-3 py-2">
                  <p className="font-semibold text-fg">{l.label || l.slug}</p>
                  <p className="truncate font-mono text-[10.5px] text-subtle" title={l.url}>{l.url}</p>
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">{l.clicks}</td>
                <td className="px-3 py-2 text-muted">{fmtDay(l.lastAt)}</td>
                <td className="px-3 py-2 text-muted">{l.byName} · {fmtDay(l.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" onClick={() => copy(short(l.slug), l.id)} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] font-semibold hover:bg-elevated">
                    {copied === l.id ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />} /go/{l.slug}
                  </button>
                  <ConfirmPopover message="Delete this link?" detail="Anyone who clicks it afterwards lands on the home page." confirmLabel="Delete" tone="danger" onConfirm={async () => { await crmPost("link.delete", { id: l.id }); setLinks((x) => x.filter((y) => y.id !== l.id)); }}>
                    {(open) => <button type="button" aria-label="Delete link" onClick={open} className="ml-1 align-middle text-subtle hover:text-rose-700"><Trash2 size={13} /></button>}
                  </ConfirmPopover>
                </td>
              </tr>
            ))}
            {links.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted"><Link2 size={14} className="mr-1 inline" />No tracked links yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
