"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, Send } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { QueuePost } from "./SocialQueue";

export type PublishingConnection = { ready: boolean; error?: string; url?: string };
export type PublicationState = Pick<QueuePost, "id" | "status" | "bufferPostId" | "publishError">;

export function SocialPublishControls({ post, connection, pending, onResult }: {
  post: QueuePost; connection: PublishingConnection | null; pending: boolean;
  onResult: (post: PublicationState, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node } = useConfirmDialog();
  if (!['approved', 'publishing', 'scheduled', 'published'].includes(post.status)) return null;

  async function act(action: "publish" | "refresh") {
    if (busy || pending) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "publish" && !await confirmDialog({ title: "Post to BioHubNet's LinkedIn Page now?",
        description: `This publishes the approved text and graphic for "${post.cycleLabel}" publicly as BioHubNet.`,
        confirmLabel: "Post now", tone: "warning",
      })) return;
      const response = await fetch("/api/admin/social/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: post.id, expectedVersion: post.editVersion }),
      });
      const result = await response.json() as { error?: string; post?: PublicationState };
      if (result.post) onResult(result.post, result.error ?? (result.post.status === "published"
        ? "Published to BioHubNet's LinkedIn Page." : "Sent to Buffer for LinkedIn delivery. Check status for confirmation."));
      if (!response.ok || result.error) throw new Error(result.error ?? "Couldn't complete the publishing request.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't publish the post."); }
    finally { setBusy(false); }
  }

  const locked = post.status === "publishing" || post.status === "scheduled";
  return <div className="space-y-2 border-t border-line pt-3">
    {node}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {post.status === "approved" && <button type="button" disabled={busy || pending || post.stale || !connection?.ready}
        onClick={() => void act("publish")} aria-label={`Post ${post.cycleLabel} to LinkedIn`}
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
        <Send size={16} />{busy ? "Posting..." : "Post to LinkedIn"}
      </button>}
      {locked && <span className="mr-auto text-sm text-muted">{post.publishError ? "Delivery needs attention" : "Sending to LinkedIn"}</span>}
      {post.bufferPostId && post.status !== "published" && <button type="button" disabled={busy} onClick={() => void act("refresh")}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg disabled:opacity-40">
        <RefreshCw size={16} />{busy ? "Checking..." : "Check status"}
      </button>}
      {connection?.url && <a href={connection.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-brand-700 underline"><ExternalLink size={14} />Open Buffer</a>}
    </div>
    {(error || post.publishError) && <p role="alert" className="text-sm text-fg">{error ?? post.publishError}</p>}
  </div>;
}
