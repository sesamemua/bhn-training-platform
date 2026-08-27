"use client";
/**
 * Opens a review — on a live URL, or on a block of pasted markup.
 *
 * A pasted review is the same review: same overlay, same comments,
 * same share link, same rounds. The only difference is that the app
 * serves the page instead of the internet doing it, which is what
 * makes it possible to review the HTML that comes back out of
 * Mailchimp rather than only pages that are already published.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Globe, Loader2, Plus } from "lucide-react";
import { normalizeReviewUrl } from "@/lib/page-review/access";

export function NewPageReviewForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createFromPaste() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/workspace/page-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, title }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "Couldn't open that review."); return; }
      setHtml(""); setTitle("");
      router.push(`/admin/workspace/website-review?r=${j.id}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      let normalizedUrl: string;
      try {
        normalizedUrl = normalizeReviewUrl(url);
        setUrl(normalizedUrl);
      } catch {
        setError("Enter a valid website address.");
        return;
      }
      const r = await fetch("/api/workspace/page-review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "Couldn't open that review."); return; }
      setUrl("");
      router.push(`/admin/workspace/website-review?r=${j.id}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 inline-flex rounded-lg border border-line p-0.5">
        {([["url", "A web page", Globe], ["paste", "Pasted code", ClipboardPaste]] as const).map(
          ([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => { setMode(k); setError(null); }}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition " +
                (mode === k ? "bg-brand-600 text-white" : "text-muted hover:text-fg")
              }
            >
              <Icon size={12} /> {label}
            </button>
          ),
        )}
      </div>

      {mode === "url" ? (
        <div className="flex gap-2 flex-wrap items-start">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (!url.trim()) return;
              try { setUrl(normalizeReviewUrl(url)); } catch { /* Validate on submit. */ }
            }}
            placeholder="biohubnet.ca/engage/regulatory-affairs/"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-[240px] text-sm bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <button
            onClick={create} disabled={busy || !url.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Start review
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] leading-relaxed text-muted">
            Paste the markup — the newsletter out of Mailchimp, a block from anywhere.
            It is served as a page with the review overlay on it, so it is commented on
            exactly like a live site. Scripts in the paste are removed and it runs with
            no access to this site.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this? e.g. September newsletter, out of Mailchimp"
            className="w-full text-sm bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={6}
            placeholder="Paste the HTML here…"
            spellCheck={false}
            className="w-full font-mono text-[12px] bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <button
            onClick={createFromPaste} disabled={busy || !html.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Start review
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-700 mt-2">{error}</p>}
    </section>
  );
}
