"use client";

/**
 * Comments pinned on a social post's graphic — inside the post's card,
 * so the whole review happens on the Social page. It reuses Design
 * Review's viewer and records: click anywhere on the graphic to pin a
 * comment, reply, resolve, copy the feedback. The post's own Approve
 * stays the approval.
 *
 * The first time, the graphic is copied in; after a graphic is replaced,
 * "Use the current graphic" brings the new one in (comments stay).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { uploadFile } from "@/lib/design-review/render";
import { reviewSocialGraphic } from "@/lib/social/graphic-review";
import { DesignArtworkView, type ArtworkViewData } from "./DesignArtworkView";

export function SocialGraphicReview({ postId, assetUrl, label, artwork, me }: {
  postId: string; assetUrl: string; label: string;
  artwork: ArtworkViewData | null;
  me: { id: string; name: string; admin: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const openComments = artwork?.pins.filter((p) => !p.parentId && p.status === "open").length ?? 0;

  /** Copy the post's current graphic in — the first time, or as a new version. */
  async function bringIn() {
    setProblem(null);
    setBusy("Preparing the graphic…");
    try {
      const res = await fetch(assetUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("The graphic couldn't be read.");
      const blob = await res.blob();
      const file = new File([blob], `${label.replace(/[^\w-]+/g, "-").slice(0, 60) || "social-graphic"}.${blob.type.split("/")[1] || "png"}`, { type: blob.type || "image/png" });
      const pages = await uploadFile(file, setBusy);
      const r = await reviewSocialGraphic(postId, pages);
      if (!r.ok) throw new Error(r.problem ?? "That didn't work — try again.");
      setOpen(true);
      setRefresh((n) => n + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn't work — try again.");
    } finally {
      setBusy(null);
    }
  }

  // Comments are signed by the person making them; with nobody signed in there is nothing to offer.
  if (!me) return null;

  return (
    <div className="px-1 py-2 text-[13px]">
      {refresh > 0 && <RefreshPage key={refresh} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {artwork ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50">
            <MessageSquare size={15} /> Comments on the graphic{openComments ? ` · ${openComments} open` : ""}
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        ) : (
          <button type="button" disabled={!!busy} onClick={() => void bringIn()}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-line px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />} {busy ?? "Comment on the graphic"}
          </button>
        )}
        {artwork && open && (
          <button type="button" disabled={!!busy} onClick={() => void bringIn()} title="After replacing the graphic: bring the new one in. Comments stay."
            className="font-semibold text-muted underline underline-offset-2 hover:text-fg disabled:opacity-50">
            {busy ?? "Use the current graphic"}
          </button>
        )}
        {problem && <span role="alert" className="basis-full font-semibold text-rose-600">{problem}</span>}
      </div>
      {artwork && open && (
        <div className="mt-2 rounded-lg border border-line bg-elevated/30 p-2">
          <DesignArtworkView artwork={artwork} me={me} approver={null} embedded />
        </div>
      )}
    </div>
  );
}

/**
 * Re-reads the page once, when mounted. Kept out of SocialGraphicReview
 * itself so the card renders anywhere — the router is only needed after
 * a graphic has actually been brought in.
 */
function RefreshPage() {
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [router]);
  return null;
}
