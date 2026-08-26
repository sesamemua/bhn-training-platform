"use client";

/**
 * Review a block of pasted HTML.
 *
 * The point of the tab is to look at the issue as it will actually go
 * out, and that is not always what this app rendered: the fragment gets
 * pasted into Mailchimp, Mailchimp rewrites links and wraps it, and the
 * thing worth signing off is what comes back out of Mailchimp. So this
 * takes a paste and shows it.
 *
 * It gets its OWN frame, sandboxed, and does not reuse the review frame
 * above it. That frame is same-origin with no sandbox on purpose — the
 * note-pinning layer reaches into its document — which is exactly what
 * makes it the wrong place for HTML we did not generate. Pasting a
 * campaign export that happens to contain a script into a same-origin
 * frame runs that script on this origin with an admin's session. Here
 * the frame carries no allow-same-origin and no allow-scripts, so the
 * paste can only be looked at.
 *
 * The cost of that is real and worth stating plainly in the UI: notes
 * cannot be pinned to a paste. Anchors live on elements this app
 * rendered, and nothing can reach into a sandboxed frame to attach a
 * click layer anyway.
 */
import { useMemo, useState } from "react";
import { ClipboardPaste, Eye, Trash2, TriangleAlert } from "lucide-react";

/** Scripts cannot execute in the frame below regardless. Stripping them
 *  is belt and braces, and it keeps the character count honest about
 *  what is being previewed. */
function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "");
}

export function PastedHtmlReview() {
  const [raw, setRaw] = useState("");
  const [open, setOpen] = useState(false);

  const cleaned = useMemo(() => stripScripts(raw), [raw]);
  const hadScript = raw.length !== cleaned.length;

  // A full document is passed through as-is; a bare fragment gets the
  // charset and neutral background an email body would have, so a paste
  // does not render as mojibake on a white page.
  const doc = useMemo(() => {
    const t = cleaned.trim();
    if (!t) return "";
    return /<html[\s>]/i.test(t)
      ? t
      : `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f4f4f4">${t}</body>`;
  }, [cleaned]);

  return (
    <section className="rounded-xl border border-line bg-card-solid">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ClipboardPaste size={14} className="text-brand-600" />
        <span className="text-[13.5px] font-semibold text-fg">Review pasted HTML</span>
        <span className="text-[12px] text-fg-subtle">
          Check a Mailchimp export, or any version this app didn&apos;t render
        </span>
        <span className="ml-auto text-[11.5px] text-subtle">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="Paste the HTML here…"
            className="w-full resize-y rounded-lg border border-line bg-card-solid px-3 py-2 font-mono text-[12px] leading-relaxed text-fg outline-none focus:border-brand-400"
          />

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11.5px] text-subtle">
              {raw.length.toLocaleString("en-CA")} characters
            </span>
            {raw && (
              <button
                type="button"
                onClick={() => setRaw("")}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-fg"
              >
                <Trash2 size={11} /> Clear
              </button>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-subtle">
              <Eye size={11} /> Preview only — notes can&apos;t be pinned to a paste
            </span>
          </div>

          {hadScript && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              A &lt;script&gt; tag was removed before previewing. Email clients strip
              scripts too, so this is closer to what recipients see.
            </p>
          )}

          {doc && (
            <iframe
              title="Pasted HTML preview"
              srcDoc={doc}
              // No allow-same-origin and no allow-scripts: this is not our
              // markup, and the frame above is same-origin on purpose.
              sandbox=""
              className="h-[70vh] w-full rounded-xl border border-line bg-white"
            />
          )}
        </div>
      )}
    </section>
  );
}
