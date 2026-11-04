"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { LinkedinTestimonial } from "@/lib/events/linkedin";
import { linkedinFeedbackClipboard } from "@/lib/events/linkedin-feedback-copy";

export function CopyFeedback({ quotes, all = false, visual = false }: { quotes: LinkedinTestimonial[]; all?: boolean; visual?: boolean }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function copy() {
    const content = linkedinFeedbackClipboard(quotes);
    setBusy(true); setCopied(false); setError("");
    try {
      if (visual && !all) {
        const visualExport = import("@/lib/events/linkedin-feedback-visual");
        const capture = visualExport.then(m => m.captureFeedbackCard(quotes[0]));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": capture.then(card => card.png), "text/html": visualExport.then(m => m.feedbackCardHtml(quotes[0], capture)), "text/plain": new Blob([content.text], { type: "text/plain" }) })]);
      } else try {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([content.html], { type: "text/html" }), "text/plain": new Blob([content.text], { type: "text/plain" }) })]);
      } catch { await navigator.clipboard.writeText(content.text); }
      setCopied(true); setError("");
    } catch { setError(visual && !all ? "Card copy failed. Reload to load the photo, then try again, or use Download Word." : "Copy unavailable. Select the quote and attribution to copy them."); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError("");
    try { await (await import("@/lib/events/linkedin-feedback-visual")).downloadFeedbackWord(quotes); }
    catch (e) { setError(e instanceof Error ? e.message : "Word download failed. Please try again."); }
    finally { setBusy(false); }
  }
  const button = "inline-flex min-h-10 items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-sm font-semibold hover:opacity-75 disabled:opacity-50";
  return <span data-html2canvas-ignore className="inline-flex flex-col items-start gap-1">
    <span className="flex flex-wrap gap-2">{visual && all && <button type="button" disabled={busy || !quotes.length} onClick={() => void download()} className={button}><Download size={16} />{busy ? "Preparing…" : "Download Word"}</button>}
    <button type="button" disabled={busy || !quotes.length} onClick={() => void copy()} className={button}>{copied ? <Check size={16} /> : <Copy size={16} />}{busy && !all ? "Preparing…" : copied ? "Copied for Word" : visual ? all ? "Copy all text" : "Copy card for Word" : all ? "Copy all for Word" : "Copy for Word"}</button></span>
    {error && <span role="alert" className="max-w-xs text-sm">{error}</span>}
    <span role="status" className="sr-only">{copied ? "Copied. Ready to paste into Word." : ""}</span>
  </span>;
}
