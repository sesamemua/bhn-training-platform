"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, LockKeyhole, Mail, MessageSquareText } from "lucide-react";
import type { NewsletterDashboardReview } from "@/lib/newsletter/dashboard-review";

export function NewsletterReviewCard({ initial }: { initial: NewsletterDashboardReview | null }) {
  const [newsletter, setNewsletter] = useState(initial);
  const [unavailable, setUnavailable] = useState(!initial);
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

  return <section aria-label="Newsletter review" className="mx-4 sm:mx-6">
    <a href={href} className="group relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-line bg-card-solid p-5 text-fg shadow-sm transition-colors hover:border-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0 space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted"><Mail size={15} aria-hidden="true" />Newsletter review</p>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{newsletter?.title ?? "Newsletter"}</h2>
        <p role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${ready ? "border-emerald-500/35 bg-emerald-500/10" : locked ? "border-amber-500/40 bg-amber-500/10" : "border-line bg-elevated"}`}><Icon size={15} aria-hidden="true" />{status}</p>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">{unavailable ? "The latest status could not be loaded. Open the newsletter desk to check, or wait for the card to reconnect." : ready ? "The latest version is ready for your comments and edits. Open the full-page review to get started." : locked ? "Revisions are underway. Wait until they are complete and the next round opens to add comments or edits." : newsletter?.sent ? "This issue has been sent. Its saved review remains available in the newsletter desk." : closed ? "This review is closed. Open the newsletter desk to see the saved issue and review history." : "The next review round will appear here when it opens."}</p>
      </div>
      <span className="flex shrink-0 items-center gap-2 self-start rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white sm:self-center">{action}<ArrowUpRight size={17} aria-hidden="true" /></span>
    </a>
  </section>;
}
