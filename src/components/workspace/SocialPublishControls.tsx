"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, RefreshCw, Send, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { POSTING_TIME_SOURCE, SOCIAL_TIME_ZONE, recommendedPostingTimes, socialDate, socialScheduledInstant } from "@/lib/social/scheduling";
import type { QueuePost } from "./SocialQueue";

export type PublishingConnection = { ready: boolean; error?: string; url?: string };
export type PublicationState = Pick<QueuePost, "id" | "status" | "bufferPostId" | "publishError" | "scheduledFor">;

export function SocialPublishControls({ post, connection, pending, onResult }: {
  post: QueuePost; connection: PublishingConnection | null; pending: boolean;
  onResult: (post: PublicationState, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [day, setDay] = useState(""), [time, setTime] = useState("");
  const [clock, setClock] = useState(0);
  const { confirmDialog, node } = useConfirmDialog();
  useEffect(() => {
    if (!scheduling) return;
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [scheduling]);
  if (!['draft', 'approved', 'publishing', 'scheduled', 'published'].includes(post.status)) return null;

  async function act(action: "publish" | "schedule" | "refresh") {
    if (busy || pending) return;
    setBusy(true);
    setError(null);
    try {
      const scheduled = action === "schedule" ? socialScheduledInstant(day, time) : null;
      if (scheduled && (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() < Date.now() + 60_000)) throw new Error("Choose a time at least one minute in the future.");
      if (action !== "refresh" && !await confirmDialog({ title: scheduled ? "Schedule this post on BioHubNet's LinkedIn Page?" : "Post to BioHubNet's LinkedIn Page now?",
        description: `This publishes the approved text and graphic for "${post.cycleLabel}" publicly as BioHubNet${scheduled ? " on " + scheduled.toLocaleString("en-CA", { timeZone: SOCIAL_TIME_ZONE, dateStyle: "full", timeStyle: "long" }) + " (Toronto)" : " now"}.`,
        confirmLabel: scheduled ? "Schedule post" : "Post now", tone: "warning",
      })) return;
      const response = await fetch("/api/admin/social/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: post.id, expectedVersion: post.editVersion, ...(scheduled ? { at: scheduled.toISOString() } : {}) }),
      });
      const result = await response.json() as { error?: string; post?: PublicationState };
      if (result.post) onResult(result.post, result.error ?? (result.post.status === "published"
        ? "Published to BioHubNet's LinkedIn Page." : scheduled && result.post.status === "scheduled" ? "Scheduled in Buffer for LinkedIn publication." : "Sent to Buffer for LinkedIn delivery. Check status for confirmation."));
      if (!response.ok || result.error) throw new Error(result.error ?? "Couldn't complete the publishing request.");
      setScheduling(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't publish the post."); }
    finally { setBusy(false); }
  }

  const locked = post.status === "publishing" || post.status === "scheduled";
  const disabled = busy || pending || post.stale || !post.assetUrl || !connection?.ready || post.status !== "approved";
  let selected: Date | null = null, timeError: string | null = null;
  if (day && time) {
    try { selected = socialScheduledInstant(day, time); }
    catch (failure) { timeError = (failure as Error).message; }
  }
  const past = !!selected && selected.getTime() < clock + 60_000;
  return <div className="space-y-2 border-t border-line pt-3">
    {node}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {post.status === "approved" && <button type="button" disabled={disabled}
        onClick={() => void act("publish")} aria-label={`Post ${post.cycleLabel} to LinkedIn`}
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
        <Send size={16} />{busy ? "Posting..." : "Post to LinkedIn"}
      </button>}
      {["draft", "approved"].includes(post.status) && <button type="button" disabled={disabled}
        title={post.status === "draft" ? "Approve the latest version before scheduling" : "Schedule publication"}
        aria-label={`Schedule ${post.cycleLabel}`} aria-expanded={scheduling} onClick={() => {
          setClock(Date.now());
          if (!day) setDay([socialDate(new Date()), socialDate(new Date(post.scheduledFor))].sort().at(-1)!);
          setScheduling(!scheduling);
        }}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg disabled:opacity-40">
        <CalendarClock size={16} />Schedule
      </button>}
      {locked && <span className="mr-auto text-sm text-muted">{post.publishError ? "Delivery needs attention" : post.status === "scheduled" && post.bufferPostId ? <>Scheduled for <time dateTime={post.scheduledFor}>{new Date(post.scheduledFor).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "long" })}</time></> : "Sending to LinkedIn"}</span>}
      {post.bufferPostId && post.status !== "published" && <button type="button" disabled={busy} onClick={() => void act("refresh")}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg disabled:opacity-40">
        <RefreshCw size={16} />{busy ? "Checking..." : "Check status"}
      </button>}
      {connection?.url && <a href={connection.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-semibold text-brand-700 underline"><ExternalLink size={14} />{locked && post.bufferPostId ? "Manage in Buffer" : "Open Buffer"}</a>}
    </div>
    {scheduling && post.status === "approved" && <form className="space-y-3 border-t border-line pt-3" aria-label={`Schedule ${post.cycleLabel}`} onSubmit={event => { event.preventDefault(); void act("schedule"); }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Toronto (Eastern Time)</p>
        <button type="button" aria-label="Cancel scheduling" title="Cancel scheduling" disabled={busy} onClick={() => setScheduling(false)} className="rounded-md border border-line p-2.5"><X size={16} /></button>
      </div>
      <label className="block text-xs font-semibold">Date
        <input type="date" required aria-label="Posting date" min={socialDate(new Date(clock))} value={day} onChange={event => setDay(event.target.value)} disabled={busy || pending}
          className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-line bg-card-solid px-3 py-2 text-sm text-fg" />
      </label>
      <fieldset disabled={busy || pending || !day} className="min-w-0 space-y-2">
        <legend className="mb-2 text-xs font-semibold">Recommended times</legend>
        <div className="grid grid-cols-3 gap-2">
          {recommendedPostingTimes(day).map((value) => {
            const instant = socialScheduledInstant(day, value);
            return <button key={value} type="button" aria-pressed={time === value} onClick={() => setTime(value)} disabled={instant.getTime() < clock + 60_000}
              className={`min-h-11 rounded-md border px-2 py-2 text-sm font-semibold disabled:opacity-40 ${time === value ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-card-solid text-fg hover:border-brand-600"}`}>
              {instant.toLocaleTimeString("en-CA", { timeZone: SOCIAL_TIME_ZONE, hour: "numeric", minute: "2-digit" })}
            </button>;
          })}
        </div>
      </fieldset>
      <p className="text-xs text-muted"><a href={POSTING_TIME_SOURCE} target="_blank" rel="noreferrer" className="text-brand-700 underline">Buffer&apos;s LinkedIn research</a>. General guidance, not BioHubNet audience data.</p>
      <label className="block text-xs font-semibold">Time
        <input type="time" required aria-label="Posting time" value={time} onChange={event => setTime(event.target.value)} disabled={busy || pending}
          className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-line bg-card-solid px-3 py-2 text-sm text-fg" />
      </label>
      <p aria-live="polite" className="text-sm text-fg">{timeError ?? (past ? "Choose a time at least one minute in the future." : selected?.toLocaleString("en-CA", { timeZone: SOCIAL_TIME_ZONE, dateStyle: "full", timeStyle: "long" }))}</p>
      <button type="submit" disabled={disabled || !selected || past} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><CalendarClock size={16} />{busy ? "Scheduling..." : "Schedule post"}</button>
    </form>}
    {(error || post.publishError) && <p role="alert" className="text-sm text-fg">{error ?? post.publishError}</p>}
  </div>;
}
