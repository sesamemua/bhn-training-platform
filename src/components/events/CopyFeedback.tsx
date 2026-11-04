"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { LinkedinTestimonial } from "@/lib/events/linkedin";
import { linkedinFeedbackClipboard } from "@/lib/events/linkedin-feedback-copy";

export function CopyFeedback({ quotes, all = false }: { quotes: LinkedinTestimonial[]; all?: boolean }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState("");
  async function copy() {
    const content = linkedinFeedbackClipboard(quotes);
    try {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([content.html], { type: "text/html" }), "text/plain": new Blob([content.text], { type: "text/plain" }) })]);
      } catch { await navigator.clipboard.writeText(content.text); }
      setCopied(true); setError("");
    } catch { setError("Copy unavailable. Select the quote and attribution to copy them."); }
  }
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" disabled={!quotes.length} onClick={() => void copy()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-current/20 px-3 py-2 text-sm font-semibold hover:opacity-75 disabled:opacity-50">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied for Word" : all ? "Copy all for Word" : "Copy for Word"}</button>
    {error && <span role="alert" className="max-w-xs text-sm">{error}</span>}
    <span role="status" className="sr-only">{copied ? "Copied. Ready to paste into Word." : ""}</span>
  </span>;
}
