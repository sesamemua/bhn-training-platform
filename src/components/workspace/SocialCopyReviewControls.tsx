"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Copy, MessageSquarePlus, Save } from "lucide-react";
import { saveSocialCopyReview, sendSocialCopyReviewGroup, socialCopyReviewSentHistory } from "@/lib/social/copy-review-actions";
import { socialCopyReviewApi, socialCopyReviewPath } from "@/lib/social/copy-review";
import { ReviewGroupInvite } from "./ReviewGroupInvite";
import { ReviewSentHistory } from "./ReviewSentHistory";

export function SocialCopyReviewControls({ postId, round, teamRound, editVersion, stale, open }: {
  postId: string; round: number; teamRound?: number; editVersion: number; stale: boolean; open: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = socialCopyReviewApi(postId);
  return <>
    {round > 0 && <Script key={round} id={`social-review-${postId}-${round}`} src={`${endpoint}?overlay=${round}`} data-round={round} strategy="afterInteractive" onError={() => setError("The comment panel could not load. Reload the page.")} />}
    <div className="my-4 flex flex-wrap items-center gap-3">
      {open && (!round || stale) && <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => {
        start(async () => {
          setError(""); setMessage("");
          try {
            const result = await saveSocialCopyReview(postId, round, editVersion);
            if (!result.ok) setError(result.error ?? "Could not save the review.");
            else window.location.reload();
          } catch { setError("Could not save the review. Reload and try again."); }
        });
      }}><Save size={15} />{busy ? "Saving..." : round ? "Save version" : "Open team review"}</button>}
      {round > 0 && <>
        {open && !stale && <button type="button" disabled={busy} className="rounded-md border border-line px-3 py-2 text-xs font-semibold" onClick={() => {
          if (!window.confirm("Open the saved version for the next team review? No invitations will be sent.")) return;
          start(async () => {
            setError("");
            try {
              const result = await saveSocialCopyReview(postId, round, editVersion, teamRound ?? 1);
              if (result.ok) window.location.reload();
              else setError(result.error ?? "Could not open team review.");
            } catch { setError("Could not open team review. Reload and try again."); }
          });
        }}>Open next team review</button>}
        {open && <button type="button" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-semibold" onClick={() => {
          document.querySelector("[data-copy-page]")?.dispatchEvent(new CustomEvent("bhn-report-comment", { bubbles: true }));
        }}><MessageSquarePlus size={14} />Comment on post</button>}
        <button type="button" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs font-semibold" onClick={async () => {
          try { await navigator.clipboard.writeText(new URL(socialCopyReviewPath(postId), window.location.origin).href); setMessage("Review link copied."); }
          catch { setError("Could not copy the link."); }
        }}><Copy size={14} />Copy review link</button>
        <ReviewGroupInvite key={round} disabled={!open || stale} send={async (ids) => {
          const result = await sendSocialCopyReviewGroup(postId, round, ids);
          router.refresh();
          return result;
        }} />
        <ReviewSentHistory load={() => socialCopyReviewSentHistory(postId)} />
      </>}
    </div>
    {stale && <p className="text-sm text-muted">The saved review does not include the latest edits from Social.</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </>;
}
