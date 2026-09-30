"use client";

/**
 * Share panel for one outreach list (admin). Mints public links
 * (/outreach/<token>) — anyone with a link gives their name (no account) and
 * can view the list, add contacts, and edit cells; additions carry their
 * name. Lists active links with copy + revoke. Mirrors the script SharePanel.
 */
import { useEffect, useRef, useState } from "react";
import { Share2, Plus, Copy, Check, Trash2, Loader2, Link as LinkIcon } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ShareLink {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
}

export function OutreachSharePanel({ listId, listName, initialLinks }: { listId: string; listName: string; initialLinks: ShareLink[] }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>(initialLinks);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLinks(initialLinks), [initialLinks]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const urlFor = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/outreach/${token}`;

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/workspace/outreach/lists/${listId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: ShareLink };
      if (res.ok && j.ok && j.link) {
        setLinks((cur) => [j.link!, ...cur]);
        try {
          await navigator.clipboard.writeText(urlFor(j.link.token));
          setCopiedId(j.link.id);
          setTimeout(() => setCopiedId(null), 2000);
        } catch { /* clipboard denied */ }
      }
    } finally {
      setCreating(false);
    }
  }

  async function copy(l: ShareLink) {
    try {
      await navigator.clipboard.writeText(urlFor(l.token));
      setCopiedId(l.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  }

  async function revoke(l: ShareLink) {
    if (!(await confirmDialog({ title: "Revoke this link?", description: "Anyone using it loses access immediately.", confirmLabel: "Revoke", tone: "destructive" }))) return;
    setLinks((cur) => cur.filter((x) => x.id !== l.id));
    await fetch(`/api/workspace/outreach/lists/${listId}/share?tokenId=${l.id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div ref={wrapRef} className="relative">
      {confirmNode}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-1.5 text-xs font-semibold text-fg hover:bg-elevated"
      >
        <Share2 size={13} /> Share
        {links.length > 0 && (
          <span className="rounded-full bg-elevated px-1.5 text-[10px] tabular-nums text-subtle">{links.length}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[24rem] rounded-xl border border-line bg-card-solid p-3 shadow-elevated">
          <p className="text-sm font-semibold text-fg">Share “{listName}”</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Anyone with a link can open this list <strong>without an account</strong> — they give
            their name, can add contacts and edit details, and every addition is credited to them.
            They can&apos;t delete contacts or see your other lists.
          </p>

          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Create link {links.length === 0 ? "" : "(another)"} — copies it
          </button>

          {links.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-lg border border-line bg-elevated/40 px-2.5 py-2">
                  <LinkIcon size={12} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg" title={urlFor(l.token)}>
                    /outreach/{l.token}
                  </span>
                  <button type="button" onClick={() => copy(l)} title="Copy link" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg">
                    {copiedId === l.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  </button>
                  <button type="button" onClick={() => revoke(l)} title="Revoke link" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-rose-700">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {copiedId && <p className="mt-2 text-[11px] font-medium text-emerald-700">Link copied — send it to your collaborator.</p>}
        </div>
      )}
    </div>
  );
}
