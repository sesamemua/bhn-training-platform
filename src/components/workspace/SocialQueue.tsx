"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Clock, Download, RefreshCw, X, Plus, Trash2, Link as LinkIcon, ArrowLeft, ArrowUp, ArrowDown, Image as ImageIcon } from "lucide-react";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";
import { useInputDialog } from "@/components/ui/InputDialog";
import { SocialPostEditor } from "./SocialPostEditor";
import { SocialGraphicReview } from "./SocialGraphicReview";
import { SocialPublishControls, type PublishingConnection } from "./SocialPublishControls";
import type { ArtworkViewData } from "./DesignArtworkView";
import type { SavedSocialText } from "@/lib/social/edit-history";
import { withSocialTags } from "@/lib/social/tags";
import { cn } from "@/lib/utils";
import { DEFAULT_SOCIAL_ORDER, moveSocialPost, sortSocialPosts, type SocialOrder } from "@/lib/social/order";

export interface QueuePost {
  id: string;
  stream: string;
  kind: string;
  status: string;
  bufferPostId?: string | null;
  publishError?: string | null;
  approvedAt?: string | null;
  approvedByName?: string | null;
  cycleLabel: string;
  daysBefore: number;
  body: string;
  editVersion: number;
  trackChanges: boolean;
  assetUrl: string | null;
  organization: string | null;
  companyLogoUrl: string | null;
  assetSpec: unknown;
  campaign?: boolean;
  symposiumDay?: boolean;
  campaignSlug?: string;
  requiresPhoto?: boolean;
  visualBrief?: string;
  publicationNote?: string;
  scheduledFor: string;
  overdue: boolean;
  /** The cycle's deadline moved after this post was approved. */
  stale: boolean;
  /** Comments pinned on its graphic (Design Review's records), once someone has started. */
  graphicReview?: ArtworkViewData | null;
}

const KIND_LABEL: Record<string, string> = {
  launch: "Launch",
  reminder: "Reminder",
  recipients: "Recipients",
  speaker: "Speaker highlight",
  event: "Event support",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-elevated text-muted ring-line",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  scheduled: "bg-brand-50 text-brand-800 ring-brand-200",
  publishing: "bg-amber-50 text-amber-800 ring-amber-200",
  published: "bg-violet-50 text-violet-800 ring-violet-200",
  skipped: "bg-elevated text-subtle ring-line",
};

function postGroup(post: QueuePost) {
  return post.symposiumDay ? "symposium_day" : post.campaign ? "symposium_2026" : post.stream;
}

export function canApproveInSeries(post: QueuePost): boolean {
  return post.campaign === true && post.status === "draft" && !!post.assetUrl && !post.stale;
}

export async function approveSeries(posts: QueuePost[], approve: (id: string) => Promise<boolean>): Promise<number> {
  let approved = 0;
  for (const post of posts.filter(canApproveInSeries)) {
    if (!await approve(post.id)) break;
    approved++;
  }
  return approved;
}

export function SocialQueue({ initial, initialOrder = { order: DEFAULT_SOCIAL_ORDER, version: null }, initialDayOrder = { order: [], version: null }, initialGroup = "symposium_2026", reviewMode = false, seriesReview = false, me = null }: {
  initial: QueuePost[];
  /** Who is looking — for commenting on graphics. */
  me?: { id: string; name: string; admin: boolean } | null;
  initialOrder?: SocialOrder | null;
  initialDayOrder?: SocialOrder | null;
  initialGroup?: "symposium_2026" | "symposium_day" | "venture_connect" | "events";
  reviewMode?: boolean;
  seriesReview?: boolean;
}) {
  const [posts, setPosts] = useState(initial);
  // Graphic comments change underneath the queue (a pin, a reply): read them from the latest
  // server render, not from the queue's own copy, which only tracks text and approval.
  const graphicReviewOf = new Map(initial.map((p) => [p.id, p.graphicReview ?? null]));
  const [group, setGroup] = useState(initialGroup);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [connection, setConnection] = useState<PublishingConnection | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/social/publish", { signal: controller.signal }).then(response => response.json()).then(setConnection)
      .catch(() => { if (!controller.signal.aborted) setConnection({ ready: false, error: "Couldn't check the LinkedIn connection. Refresh to try again." }); });
    return () => controller.abort();
  }, []);
  const [selected, setSelected] = useState(() => initial.filter(canApproveInSeries).map((post) => post.id));
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [layout, setLayout] = useState(initialOrder ?? { order: DEFAULT_SOCIAL_ORDER, version: null });
  const [dayLayout, setDayLayout] = useState(initialDayOrder ?? { order: [], version: null });
  const [dayOrderUnavailable, setDayOrderUnavailable] = useState(initialDayOrder === null);
  const [newDayPost, setNewDayPost] = useState<{ title: string; body: string; requestId: string } | null>(null);
  const [orderUnavailable, setOrderUnavailable] = useState(initialOrder === null);
  const [orderBusy, setOrderBusy] = useState(false);
  const { inputDialog, node: inputNode } = useInputDialog();
  const [drafts, setDrafts] = useState<Record<string, { body: string; pending: boolean }>>({});
  const onSaved = useCallback((saved: SavedSocialText) => {
    setPosts((all) => all.map((post) => post.id === saved.id ? { ...post, ...saved } : post));
  }, []);
  const onDraftState = useCallback((id: string, body: string, pending: boolean) => {
    setDrafts((all) => ({ ...all, [id]: { body, pending } }));
  }, []);
  const hasUnsavedChanges = Object.values(drafts).some((draft) => draft.pending);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch("/api/admin/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, expectedVersion: posts.find((post) => post.id === id)?.editVersion, ...extra }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; approvedAt?: string; approvedByName?: string | null };
      if (!res.ok) throw new Error(j.error ?? "Couldn't save.");
      if (action === "skip" && posts.find(post => post.id === id)?.symposiumDay) setDayLayout(current => ({ ...current, order: current.order.filter(key => key !== id) }));
      setPosts((all) =>
        all.map((p) =>
          p.id === id
            ? {
                ...p,
                ...(action === "approve" ? { approvedAt: j.approvedAt, approvedByName: j.approvedByName } : {}),
                status:
                  action === "approve" ? "approved"
                  : action === "unapprove" ? "draft"
                  : action === "skip" ? "skipped"
                  : action === "markPublished" ? "published"
                  : p.status,
              }
            : p,
        ),
      );
      return true;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogo(post: QueuePost, file: File) {
    if (file.size > 3_000_000) {
      setNote("Choose a logo under 3 MB.");
      return;
    }
    setBusy(post.id);
    setNote(null);
    try {
      const form = new FormData();
      form.set("logo", file);
      const response = await fetch(`/api/admin/social/posts/${post.id}/company-logo`, {
        method: "POST", body: form,
      });
      const result = await response.json() as { url?: string; editVersion?: number; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error ?? "Couldn't upload the logo.");
      setPosts((all) => all.map((item) => item.id === post.id
        ? { ...item, companyLogoUrl: result.url!, editVersion: result.editVersion ?? item.editVersion, status: "draft", approvedAt: null, approvedByName: null, assetUrl: post.assetUrl ? `${post.assetUrl.split("?")[0]}?v=${Date.now()}` : null }
        : item));
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't upload the logo.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(p: QueuePost) {
    const body = withSocialTags(drafts[p.id]?.body ?? p.body);
    try {
      await navigator.clipboard.writeText(body);
      setCopied(p.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      await inputDialog({ title: "Copy the post", defaultValue: body, confirmLabel: "Done", allowEmpty: true, maxLength: Math.max(200, body.length) });
    }
  }

  async function uploadGraphic(post: QueuePost, file: File) {
    if (file.size > 3_000_000) {
      setNote("Choose a graphic under 3 MB.");
      return;
    }
    setBusy(post.id);
    setNote(null);
    try {
      const form = new FormData();
      form.set("graphic", file);
      const response = await fetch(`/api/admin/social/posts/${post.id}/graphic`, { method: "POST", body: form });
      const result = await response.json() as { url?: string; editVersion?: number; error?: string };
      if (!response.ok || !result.url || typeof result.editVersion !== "number") throw new Error(result.error ?? "Couldn't upload the graphic.");
      setPosts((all) => all.map((item) => item.id === post.id ? { ...item, assetUrl: result.url!, editVersion: result.editVersion!, status: "draft", approvedAt: null, approvedByName: null } : item));
      setNote("Graphic saved.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't upload the graphic.");
    } finally {
      setBusy(null);
    }
  }

  async function copyReviewLink(id: string) {
    const url = new URL(`/admin/workspace/marketing/social?post=${encodeURIComponent(id)}`, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Review link copied.");
    } catch {
      await inputDialog({ title: "Review link", defaultValue: url, confirmLabel: "Done", allowEmpty: true, maxLength: 1000 });
    }
  }

  const active = posts.filter((post) => !["published", "skipped"].includes(post.status));
  const boardPosts = posts.filter((post) => post.status !== "skipped");
  const visible = sortSocialPosts(seriesReview ? active.filter((post) => post.campaign) : reviewMode ? posts : boardPosts.filter((post) => postGroup(post) === group), group === "symposium_day" ? dayLayout.order : layout.order);
  const ready = visible.filter(canApproveInSeries);
  const chosen = ready.filter((post) => selected.includes(post.id));
  const downloadable = visible.filter((post) => !!post.assetUrl);

  async function downloadGraphics(items: QueuePost[], zip = false) {
    if (downloadBusy || !items.length) return;
    setDownloadBusy(zip ? "all" : items[0].id);
    setNote(null);
    try {
      const params = new URLSearchParams({ ids: items.map((post) => post.id).join(","), ...(zip ? { zip: "1" } : {}) });
      const response = await fetch(`/api/admin/social/graphics?${params}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Couldn't download the graphics.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "biohubnet-social-graphics.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't download the graphics.");
    } finally { setDownloadBusy(null); }
  }

  async function movePost(post: QueuePost, direction: -1 | 1, scope: QueuePost[]) {
    const unavailable = post.symposiumDay ? dayOrderUnavailable : orderUnavailable;
    if (!post.campaignSlug || orderBusy || unavailable || hasUnsavedChanges || seriesBusy || busy) return;
    const currentLayout = post.symposiumDay ? dayLayout : layout;
    const setCurrentLayout = post.symposiumDay ? setDayLayout : setLayout;
    const order = moveSocialPost(currentLayout.order, post.campaignSlug, direction, scope.flatMap((item) => item.campaignSlug ? [item.campaignSlug] : []));
    setOrderBusy(true);
    setNote(null);
    try {
      const response = await fetch(post.symposiumDay ? "/api/admin/social/day" : "/api/admin/social/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(post.symposiumDay ? { action: "order" } : {}), order, version: currentLayout.version }) });
      const result = await response.json() as { layout?: SocialOrder; error?: string };
      if (response.status === 409 && result.layout) {
        setCurrentLayout(result.layout);
        setNote("Another admin changed the order. The latest order is loaded; try your move again.");
      } else if (!response.ok || !result.layout) throw new Error(result.error ?? "Couldn't save the post order.");
      else { setCurrentLayout(result.layout); setNote("Post order saved for all admins."); }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't save the post order.");
      if (post.symposiumDay) setDayOrderUnavailable(true); else setOrderUnavailable(true);
    } finally { setOrderBusy(false); }
  }

  function orderControls(post: QueuePost, scope: QueuePost[]) {
    const index = scope.findIndex((item) => item.id === post.id);
    const disabled = orderBusy || (post.symposiumDay ? dayOrderUnavailable : orderUnavailable) || hasUnsavedChanges || seriesBusy || !!busy || !post.campaignSlug;
    return <span className="inline-flex shrink-0 gap-1">
      <button type="button" aria-label={`Move ${post.cycleLabel} up`} title="Move up" disabled={disabled || index === 0} onClick={() => void movePost(post, -1, scope)} className="inline-flex size-8 items-center justify-center rounded-md border border-line text-brand-700 hover:bg-brand-50 disabled:opacity-30"><ArrowUp size={16} /></button>
      <button type="button" aria-label={`Move ${post.cycleLabel} down`} title="Move down" disabled={disabled || index === scope.length - 1} onClick={() => void movePost(post, 1, scope)} className="inline-flex size-8 items-center justify-center rounded-md border border-line text-brand-700 hover:bg-brand-50 disabled:opacity-30"><ArrowDown size={16} /></button>
    </span>;
  }

  async function createDayPost() {
    if (!newDayPost || busy) return;
    setBusy("new"); setNote(null);
    try {
      const response = await fetch("/api/admin/social/day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...newDayPost }) });
      const result = await response.json() as { post?: QueuePost; layout?: SocialOrder; error?: string };
      if (!response.ok || !result.post || !result.layout) throw new Error(result.error ?? "Couldn't create the draft.");
      setPosts(all => all.some(p => p.id === result.post!.id) ? all : [...all, result.post!]);
      setDayLayout(result.layout); setDayOrderUnavailable(false); setNewDayPost(null); setNote("Draft created. Nothing has been published.");
    } catch (error) { setNote(error instanceof Error ? error.message : "Couldn't create the draft."); }
    finally { setBusy(null); }
  }

  async function approveSelected() {
    if (seriesBusy || busy || hasUnsavedChanges || !chosen.length) return;
    setSeriesBusy(true);
    try {
      const approved = await approveSeries(chosen, (id) => act(id, "approve"));
      const approvedIds = chosen.slice(0, approved).map((post) => post.id);
      setSelected((all) => all.filter((id) => !approvedIds.includes(id)));
      setNote((message) => approved === chosen.length
        ? `${approved} posts approved.`
        : `${approved} of ${chosen.length} posts approved. Remaining posts need review. ${message ?? ""}`);
    } finally {
      setSeriesBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {inputNode}
      {reviewMode || seriesReview ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/admin/workspace/marketing/social?tab=${encodeURIComponent(seriesReview ? "symposium_2026" : posts[0] ? postGroup(posts[0]) : "events")}`} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
          <ArrowLeft size={16} /> All social posts
        </Link>
        {!seriesReview && posts[0]?.campaign && <Link href="/admin/workspace/marketing/social?series=symposium_2026" className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"><Check size={16} /> Review full series</Link>}
        </div>
      ) : (<>
      <div className="flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Social content groups">
        {([
          ["symposium_2026", "2026 Symposium & Training Week"],
          ["symposium_day", "Symposium Day · Oct 29"],
          ["venture_connect", "VentureConnect"],
          ["events", "Events"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={group === key}
            disabled={hasUnsavedChanges && group !== key}
            onClick={() => setGroup(key)}
            className={cn(
              "border-b-2 px-4 py-3 text-[16px] font-semibold transition-colors",
              group === key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {label} <span className="ml-1 text-subtle">{boardPosts.filter((post) => postGroup(post) === key).length}</span>
          </button>
        ))}
      </div>
      <h2 className="text-[26px] font-bold leading-tight text-fg sm:text-[32px]">
        {group === "symposium_day" ? "Symposium Day · October 29" : group === "events" ? "Events" : group === "symposium_2026" ? "2026 Symposium & Training Week" : "VentureConnect"}
      </h2>
      {group === "symposium_2026" && visible.length > 0 && <Link href="/admin/workspace/marketing/social?series=symposium_2026" className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"><Check size={16} /> Review & approve series</Link>}
      {group !== "symposium_2026" && group !== "symposium_day" && <p className="text-[14px] text-muted">
        {group === "events"
          ? "Edit your event posts directly in the preview. Changes save automatically; upload a graphic when it’s ready."
          : "Posts follow live VentureConnect cycles. Approve the words before sharing them."}
      </p>}
      {group === "symposium_day" && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3"><a href="https://biohubnet.ca/2026-annual-symposium/#program" target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-700 underline">Symposium agenda</a><button type="button" disabled={!!busy || hasUnsavedChanges} onClick={() => setNewDayPost({ title: "", body: "", requestId: crypto.randomUUID() })} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Plus size={16} /> New post</button></div>
        {dayOrderUnavailable && <p role="status" className="text-sm text-amber-700">Shared post order is unavailable. Refresh before rearranging posts.</p>}
        {newDayPost && <form className="max-w-[555px] space-y-2" onSubmit={e => { e.preventDefault(); void createDayPost(); }}>
          <label className="block text-sm font-semibold">Post title<input required maxLength={200} disabled={!!busy} value={newDayPost.title} onChange={e => setNewDayPost({ ...newDayPost, title: e.target.value })} className="mt-1 w-full rounded-md border border-line bg-card-solid px-3 py-2 text-fg" /></label>
          <label className="block text-sm font-semibold">Post text<textarea required maxLength={6000} rows={5} disabled={!!busy} value={newDayPost.body} onChange={e => setNewDayPost({ ...newDayPost, body: e.target.value })} className="mt-1 w-full rounded-md border border-line bg-card-solid px-3 py-2 text-fg" /></label>
          <div className="flex gap-2"><button type="submit" disabled={!!busy} className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save draft</button><button type="button" disabled={!!busy} onClick={() => setNewDayPost(null)} className="rounded-md px-3 py-2 text-sm text-muted">Cancel</button></div>
        </form>}
      </div>}
      </>)}
      {seriesReview && <div className="sticky top-0 z-20 mx-auto flex w-full max-w-[555px] flex-wrap items-center justify-between gap-3 border-y border-line bg-card-solid px-3 py-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg">{visible.length} posts · {ready.length} ready for approval</p>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" aria-label="Select all ready posts" checked={ready.length > 0 && chosen.length === ready.length} ref={(input) => { if (input) input.indeterminate = chosen.length > 0 && chosen.length < ready.length; }} disabled={seriesBusy || !!busy || hasUnsavedChanges || !ready.length} onChange={(event) => setSelected(event.target.checked ? ready.map((post) => post.id) : [])} className="size-4 accent-emerald-700" />
            Select all ready posts
          </label>
        </div>
        <button type="button" disabled={seriesBusy || !!busy || hasUnsavedChanges || !chosen.length} onClick={() => void approveSelected()} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"><Check size={16} />{seriesBusy ? "Approving..." : `Approve selected (${chosen.length})`}</button>
      </div>}
      {!reviewMode && <div className="flex justify-end">
        <button type="button" disabled={!!downloadBusy || !downloadable.length} onClick={() => void downloadGraphics(downloadable, true)} className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40">
          <Download size={16} /> {downloadBusy === "all" ? "Preparing download..." : `Download all graphics (${downloadable.length})`}
        </button>
      </div>}
      {connection && <p role="status" className="text-[13px] text-fg">{connection.ready ? "LinkedIn: BioHubNet Page connected" : connection.error ?? "LinkedIn connection unavailable"}</p>}
      {note && <p role="status" className="text-[13px] text-fg">{note}</p>}
      {orderUnavailable && (group === "symposium_2026" || seriesReview) && <p role="status" className="text-[13px] text-amber-700">Shared post order is unavailable. Refresh before moving posts.</p>}
      {visible.length === 0 && (
        <p className="rounded-lg border border-line bg-card p-5 text-[13px] leading-relaxed text-muted">
          {group === "events"
            ? "No event posts yet."
            : group === "symposium_day"
            ? "No symposium-day drafts. Create a new post when you're ready."
            : group === "symposium_2026"
            ? "No campaign posts yet."
            : "No VentureConnect drafts yet. They appear when a cycle opens."}
        </p>
      )}
      <fieldset disabled={seriesBusy || orderBusy} className="@container min-w-0 border-0 p-0">
      <legend className="sr-only">{seriesReview ? "Series posts" : "Social posts"}</legend>
      <div className={reviewMode || seriesReview ? "space-y-4" : "columns-1 gap-6 @min-[800px]:columns-2 @min-[1240px]:columns-3"}>
      {visible.map((p) => (
        <section key={p.id} aria-label={p.cycleLabel} className={cn("mx-auto w-full max-w-[555px] space-y-2", !reviewMode && !seriesReview && "mb-6 inline-block break-inside-avoid align-top")}>
          {seriesReview && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-1 pt-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-fg">
              <input type="checkbox" aria-label={`Select ${p.cycleLabel} for approval`} checked={canApproveInSeries(p) && selected.includes(p.id)} disabled={!canApproveInSeries(p) || !!busy || hasUnsavedChanges} onChange={(event) => setSelected((all) => event.target.checked ? [...all, p.id] : all.filter((id) => id !== p.id))} className="size-4 accent-emerald-700" />
              {p.cycleLabel}
            </label>
            {!canApproveInSeries(p) && p.status === "draft" && <span className="text-xs font-semibold text-muted">{!p.assetUrl ? p.requiresPhoto ? "Awaiting event photos" : "Graphic needed" : "Changes need review"}</span>}
          </div>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 py-1">
            {(p.campaign || p.symposiumDay) && !reviewMode && orderControls(p, visible.filter((post) => p.symposiumDay ? post.symposiumDay : post.campaign))}
            <span className="text-[12px] font-bold text-muted">
              {KIND_LABEL[p.kind] ?? p.kind}
              {p.kind === "reminder" && (
                <span className="ml-1.5 font-normal text-muted">
                  {p.daysBefore === 0 ? "closing day" : `${p.daysBefore} days out`}
                </span>
              )}
            </span>
            {!seriesReview && <span className="text-[14px] font-semibold text-fg">{p.cycleLabel}</span>}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] ring-1 ring-inset",
                STATUS_TONE[p.status] ?? STATUS_TONE.draft,
              )}
            >
              {p.status}
            </span>
            {p.status === "scheduled" && p.bufferPostId && (
              <time dateTime={p.scheduledFor} className="text-[12px] font-semibold text-fg">{new Date(p.scheduledFor).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "long" })}</time>
            )}
            {p.status === "approved" && p.approvedAt && (
              <span className="text-[12px] text-muted">Approved{p.approvedByName ? ` by ${p.approvedByName}` : ""} on {new Date(p.approvedAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" })}</span>
            )}
            {p.overdue && p.status === "draft" && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700">
                <Clock size={12} /> overdue
              </span>
            )}
            {/* The one thing the queue can tell you that the post cannot
                tell you itself: the cycle moved after somebody approved
                these words, so the date in them is out of date. */}
            {p.stale && (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-700">
                <RefreshCw size={12} /> {p.stream === "symposium_2026"
                  ? "Speaker details changed; review this draft and graphic again"
                  : "the deadline moved since this was approved"}
              </span>
            )}
          </div>

          <article className="overflow-hidden rounded-[8px] border border-line-strong bg-card-solid text-fg shadow-sm">
            <div className="flex items-center gap-2.5 px-4 pb-1 pt-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-card-solid">
                <LogoMark size={34} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight">BioHubNet</p>
                <p className="text-[12px] text-muted">LinkedIn post preview</p>
              </div>
            </div>

            <div className="px-4 pb-3 pt-2">
              <SocialPostEditor post={{ ...p, body: withSocialTags(p.body) }} label={p.cycleLabel} onSaved={onSaved} onDraftState={onDraftState} />
            </div>

            {p.assetUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={p.assetUrl} alt={`Social graphic for ${p.cycleLabel}`} className="block aspect-square w-full border-t border-line object-contain" />
            )}
          </article>

          {!p.assetUrl && <p className="px-1 text-[12px] text-muted">{p.requiresPhoto ? "Awaiting event photos" : "Graphic needed"}</p>}
          {p.assetUrl && <SocialGraphicReview postId={p.id} assetUrl={p.assetUrl} label={p.cycleLabel} artwork={graphicReviewOf.get(p.id) ?? null} me={me} />}

          {(p.campaign || p.symposiumDay) && (
            <details className="border-b border-line px-1 py-2 text-[13px] text-muted">
              <summary className="cursor-pointer font-semibold text-fg">Image & publication brief</summary>
              <p className="mt-2 leading-relaxed">{p.visualBrief}</p>
              <p className="mt-2 leading-relaxed">{p.publicationNote}</p>
            </details>
          )}

          {p.stream === "events" && ["draft", "approved"].includes(p.status) && (
            <div className="flex flex-wrap items-center gap-3 px-1 py-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-500">
                <ImageIcon size={16} /> {busy === p.id && !seriesBusy ? "Uploading…" : p.assetUrl ? "Replace graphic" : "Upload graphic"}
                <input
                  type="file"
                  aria-label={`Upload graphic for ${p.cycleLabel}`}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  disabled={busy === p.id}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadGraphic(p, file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <span className="text-[12px] text-muted">PNG, JPEG, WebP or GIF · under 3 MB</span>
              {p.assetUrl && <a href={p.assetUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-brand-700 underline">Open graphic</a>}
            </div>
          )}

          {p.stream === "symposium_2026" && (
            <div className="flex flex-wrap items-center gap-3 px-1 py-2">
              {p.companyLogoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.companyLogoUrl} alt={`${p.organization ?? "Organization"} logo`} className="h-16 w-40 object-contain" />
              ) : <span className="text-[13px] text-muted">No organization logo selected</span>}
              {["draft", "approved"].includes(p.status) && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
                  <ImageIcon size={16} /> {p.companyLogoUrl ? "Replace organization logo" : "Upload organization logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy === p.id}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadLogo(p, file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          )}

          <footer className="flex flex-col gap-2 px-1 pb-6 pt-1">
            <div className="flex flex-wrap items-center gap-2">
            {!reviewMode && !seriesReview && <Link href={`/admin/workspace/marketing/social?post=${encodeURIComponent(p.id)}`} className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[14px] font-semibold text-brand-700"><LinkIcon size={16} /> Review</Link>}
            <button type="button" onClick={() => void copyReviewLink(p.id)} title="Copy review link" aria-label={`Copy review link for ${p.cycleLabel}`} className="inline-flex size-10 items-center justify-center rounded-[6px] border border-line text-brand-700 hover:bg-brand-50"><LinkIcon size={16} /></button>
            <button
              type="button"
              onClick={() => void copy(p)}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[14px] font-semibold text-fg transition-colors hover:bg-brand-50"
            >
              <Copy size={16} /> {copied === p.id ? "Copied" : "Copy post"}
            </button>

            {p.assetUrl && (
              <button
                type="button"
                aria-label={`Download graphic for ${p.cycleLabel}`}
                disabled={!!downloadBusy}
                onClick={() => void downloadGraphics([p])}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 text-[14px] font-semibold text-fg transition-colors hover:bg-brand-50"
              >
                <Download size={16} /> {downloadBusy === p.id ? "Downloading..." : "Download graphic"}
              </button>
            )}

            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
            {["draft", "approved"].includes(p.status) && (
              p.symposiumDay ? <ConfirmPopover message={`Delete ${p.cycleLabel}?`} detail="Removes this draft from the day-of board. It will not be regenerated." confirmLabel="Delete post" onConfirm={() => { void act(p.id, "skip"); }}>
                {open => <button type="button" onClick={open} disabled={!!busy || drafts[p.id]?.pending} className="mr-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/10 disabled:opacity-40"><Trash2 size={14} /> Delete post</button>}
              </ConfirmPopover> :
              <button
                type="button"
                disabled={busy === p.id || drafts[p.id]?.pending}
                onClick={() => void act(p.id, "skip")}
                className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-elevated disabled:opacity-40"
                title="Decline this post"
              >
                <X size={12} /> Not this one
              </button>
            )}
            {p.status === "draft" && (
              <button
                type="button"
                disabled={busy === p.id || drafts[p.id]?.pending || (seriesReview && !canApproveInSeries(p))}
                onClick={() => void act(p.id, "approve")}
                className="ml-auto inline-flex items-center gap-1.5 rounded-[6px] bg-emerald-700 px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-40"
              >
                <Check size={12} /> Approve
              </button>
            )}
            {p.status === "approved" && (
              <>
                <button
                  type="button"
                  disabled={busy === p.id || drafts[p.id]?.pending}
                  onClick={() => void act(p.id, "markPublished")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:bg-elevated disabled:opacity-40"
                >
                  <Check size={12} /> Already posted manually
                </button>
                <button
                  type="button"
                  disabled={busy === p.id || drafts[p.id]?.pending}
                  onClick={() => void act(p.id, "unapprove")}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-elevated"
                >
                  Back to draft
                </button>
              </>
            )}
            </div>
            <SocialPublishControls post={p} connection={connection} pending={!!busy || hasUnsavedChanges || seriesBusy} onResult={(saved, message) => {
              setPosts(all => all.map(item => item.id === saved.id ? { ...item, ...saved } : item));
              setNote(message);
            }} />
          </footer>
        </section>
      ))}
      </div>
      </fieldset>
    </div>
  );
}
