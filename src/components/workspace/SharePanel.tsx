"use client";

/**
 * Share panel for a workspace script (admin). Creates public collaboration
 * links (/scripts/<token>), lists active ones with copy + revoke. Anyone with
 * a link can open the script without an account — they give their name, and
 * their edits are attributed in History.
 *
 * The popup renders in a PORTAL with fixed positioning computed from the
 * button's rect. It must: the Share button sits in PageHero's actions slot,
 * and the hero (DSPageHeader) is `overflow-hidden` to clip its mesh gradient —
 * an in-flow `absolute` dropdown would be cropped at the hero's edge. The
 * portal escapes that clip entirely (same pattern as the sidebar tooltips).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, Plus, Copy, Check, Trash2, Loader2, Link as LinkIcon } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ShareLink {
  id: string;
  token: string;
  label: string | null;
  createdAt: string;
}

const POPUP_WIDTH = 384; // w-[24rem]

export function SharePanel({ scriptId, initialLinks }: { scriptId: string; initialLinks: ShareLink[] }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>(initialLinks);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  // Portals need a DOM target — only render the popup after mount.
  useEffect(() => setMounted(true), []);

  // Position the popup below the button, right-aligned to it, clamped to the
  // viewport so it never spills off the left/right edge.
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - POPUP_WIDTH, window.innerWidth - POPUP_WIDTH - 8));
    setPos({ top: r.bottom + 8, left });
  }

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep aligned while scrolling/resizing; close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const urlFor = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/scripts/${token}`;

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/workspace/scripts/${scriptId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; link?: ShareLink };
      if (res.ok && j.ok && j.link) {
        setLinks((cur) => [j.link!, ...cur]);
        // Copy the fresh link right away — the most common next step.
        try {
          await navigator.clipboard.writeText(urlFor(j.link.token));
          setCopiedId(j.link.id);
          setTimeout(() => setCopiedId(null), 2000);
        } catch { /* clipboard denied — they can use the Copy button */ }
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
    await fetch(`/api/workspace/scripts/${scriptId}/share?tokenId=${l.id}`, { method: "DELETE" }).catch(() => {});
  }

  const popup = (
    <div
      ref={popupRef}
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: POPUP_WIDTH }}
      className="z-[80] rounded-xl border border-line bg-card-solid p-3 shadow-elevated"
    >
      <p className="text-sm font-semibold text-fg">Share for collaboration</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        Anyone with a link can open this script <strong>without an account</strong> — they give
        their name, edit live, and every change is attributed in History.
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
                /scripts/{l.token}
              </span>
              <button
                type="button"
                onClick={() => copy(l)}
                title="Copy link"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg"
              >
                {copiedId === l.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
              <button
                type="button"
                onClick={() => revoke(l)}
                title="Revoke link"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-rose-700"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {copiedId && <p className="mt-2 text-[11px] font-medium text-emerald-700">Link copied — send it to your collaborator.</p>}
      {/* Inside the popup so a click on the confirm card isn't an "outside click" that closes it. */}
      {confirmNode}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
      >
        <Share2 size={13} /> Share
        {links.length > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 text-[10px] tabular-nums">{links.length}</span>
        )}
      </button>

      {open && mounted && createPortal(popup, document.body)}
    </div>
  );
}
