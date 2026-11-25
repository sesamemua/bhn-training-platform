"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Code2, Copy, ExternalLink } from "lucide-react";
import { newsletterArchiveDateLabel, type NewsletterArchiveMetadata } from "@/lib/newsletter/archive";

/** Sent content is immutable here: this viewer has no saving or review actions. */
export function NewsletterArchive({ title, dateline, html, metadata }: {
  title: string; dateline: string; html: string | null; metadata: NewsletterArchiveMetadata | null;
}) {
  const [showCode, setShowCode] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const sent = newsletterArchiveDateLabel(metadata);

  async function copyHtml() {
    try { await navigator.clipboard.writeText(html ?? ""); setCopyMessage("HTML copied."); }
    catch { setShowCode(true); setCopyMessage("Select and copy the HTML below."); }
  }

  return <section className="min-w-0 space-y-4" aria-label="Sent newsletter archive">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line pb-4">
      <Link href="/admin/workspace/marketing/newsletter/past" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft size={15} aria-hidden="true" />Past issues</Link>
      <p className="mr-auto text-sm text-muted">{sent ? `Sent ${sent}` : dateline} · Read-only archive</p>
      {metadata?.archiveUrl && <a href={metadata.archiveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">Original Mailchimp issue <ExternalLink size={15} aria-hidden="true" /></a>}
      {html && <>
        <button type="button" onClick={() => setShowCode(!showCode)} aria-expanded={showCode} aria-controls="newsletter-archive-code" className="inline-flex items-center gap-1.5 text-sm font-semibold"><Code2 size={15} aria-hidden="true" />{showCode ? "Hide code" : "View code"}</button>
        <button type="button" onClick={copyHtml} className="inline-flex items-center gap-1.5 text-sm font-semibold"><Copy size={15} aria-hidden="true" />Copy HTML</button>
      </>}
    </div>
    <p role="status" className="text-xs text-muted">{copyMessage}</p>
    {html ? <div className={showCode ? "grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2" : "min-w-0"}>
      <iframe title={`${title} — sent newsletter`} srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" className="h-[80vh] min-h-96 w-full border border-line bg-white" />
      {showCode && <div className="min-w-0" id="newsletter-archive-code">
        <label htmlFor="newsletter-archive-html" className="sr-only">Original sent newsletter HTML</label>
        <textarea id="newsletter-archive-html" value={html} readOnly spellCheck={false} className="h-[80vh] min-h-96 w-full resize-y border border-line bg-card p-4 font-mono text-xs text-fg" />
      </div>}
    </div> : <p className="py-8 text-sm text-muted">The saved HTML is unavailable for this issue.{metadata?.archiveUrl ? " Use the original Mailchimp issue link above." : " Contact an editor for the original sent copy."}</p>}
  </section>;
}
