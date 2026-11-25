"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, LockKeyhole, MailOpen, MessageSquareText } from "lucide-react";
import type { NewsletterDashboardReview } from "@/lib/newsletter/dashboard-review";

export function NewsletterReviewCard({ initial }: { initial: NewsletterDashboardReview | null }) {
  const [newsletter, setNewsletter] = useState(initial);
  const [unavailable, setUnavailable] = useState(!initial);
  const descriptionId = useId();
  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    async function refresh() {
      if (document.hidden || pending) return;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch("/api/workspace/newsletter/dashboard-review", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Status unavailable");
        const body = await response.json();
        if (!body.newsletter) throw new Error("Status unavailable");
        if (!disposed) { setNewsletter(body.newsletter); setUnavailable(false); }
      } catch {
        if (!disposed) setUnavailable(true);
      } finally { window.clearTimeout(timeout); pending = null; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { disposed = true; pending?.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const review = newsletter?.review;
  const ready = !unavailable && !newsletter?.sent && review?.status === "open";
  const locked = !unavailable && !newsletter?.sent && review?.status === "exported";
  const closed = !unavailable && review?.status === "closed";
  const desk = `/admin/workspace/marketing/newsletter/review${newsletter?.issueId ? `?issue=${encodeURIComponent(newsletter.issueId)}` : ""}`;
  const href = !unavailable && !newsletter?.sent && review && (ready || locked)
    ? `/api/workspace/page-review/${encodeURIComponent(review.id)}/launch` : desk;
  const status = unavailable ? "Status unavailable" : newsletter?.sent ? "Newsletter sent" : ready ? `Round ${review!.round} is open` : locked ? `Round ${review!.round} is locked` : closed ? `Round ${review!.round} is closed` : "Review not open yet";
  const action = ready ? "Start reviewing" : locked ? "View locked round" : "Open newsletter desk";
  const Icon = locked || closed ? LockKeyhole : MessageSquareText;

  // A saved draft is not an invitation to review. Keep polling so explicit opening reveals the tile.
  if (!review || review.status === "pending" || newsletter?.sent) return null;

  const detail = unavailable ? "The latest status could not be loaded. Open the newsletter desk to check." : locked ? "Revisions are underway. Wait until they are complete and the next round opens to add comments or edits." : ready ? "Open the full-page review to add comments and edits." : "The next review round will appear here when it opens.";
  return <section aria-label="Newsletter review" className="mx-4 flex items-start sm:mx-6">
    <a href={href} title={detail} aria-describedby={descriptionId} data-newsletter-review-tile className="group relative flex min-h-56 w-56 max-w-full flex-col items-center gap-3 rounded-2xl border border-line bg-card-solid px-4 py-5 text-center text-fg shadow-sm transition-colors hover:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500">
      <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-700"><MailOpen size={52} strokeWidth={1.4} aria-hidden="true" /></span>
      <h2 className="max-w-full text-sm font-semibold leading-snug">{newsletter?.title ?? "Newsletter review"}</h2>
      <p role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${ready ? "border-emerald-500/35 bg-emerald-500/10" : locked ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-elevated"}`}><Icon size={13} aria-hidden="true" />{status}</p>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">{action}<ArrowUpRight size={13} aria-hidden="true" /></span>
    </a>
    <p id={descriptionId} className="sr-only">{detail}</p>
  </section>;
}
