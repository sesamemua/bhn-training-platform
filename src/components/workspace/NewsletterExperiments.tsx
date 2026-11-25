"use client";

import { useState } from "react";
import { Inbox, ScanLine } from "lucide-react";

export function checkNewsletterHtml(doc: Document, html: string) {
  // Template contents are inert: inspecting the email doesn't load its images or links.
  const template = doc.createElement("template");
  template.innerHTML = html;
  const links = [...template.content.querySelectorAll("a[href], a:not([id]):not([name])")];
  const images = [...template.content.querySelectorAll("img")];
  const issues: string[] = [];

  links.forEach((link, i) => {
    const href = link.getAttribute("href")?.trim() ?? "";
    const destination = URL.canParse(href) ? new URL(href) : null;
    const deferred = /^(?:#\S+|\*\|[^|]+\|\*)$/.test(href);
    const valid = destination && (["http:", "https:"].includes(destination.protocol)
      ? !!destination.hostname
      : ["mailto:", "tel:"].includes(destination.protocol) && !!destination.pathname);
    if (!deferred && !valid) issues.push(`Link ${i + 1} has a missing or unsupported destination.`);
    if (!link.textContent?.trim() && !link.getAttribute("aria-label")?.trim()
      && ![...link.querySelectorAll("img")].some((image) => image.alt.trim())) {
      issues.push(`Link ${i + 1} has no readable label.`);
    }
  });
  images.forEach((image, i) => {
    if (!image.hasAttribute("alt")) issues.push(`Image ${i + 1} has no alt attribute.`);
  });
  return { links: links.length, images: images.length, issues };
}

export function NewsletterExperiments({ title, html }: { title: string; html: string | null }) {
  const [subject, setSubject] = useState(title);
  const [preheader, setPreheader] = useState("");
  const [run, setRun] = useState<{ html: string; result: ReturnType<typeof checkNewsletterHtml> } | null>(null);
  const check = run?.html === html ? run.result : null;
  const field = "mt-1 w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-sm text-fg";

  return (
    <div className="mt-4 space-y-4">
      <section className="space-y-2 border-t border-line pt-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-fg"><Inbox size={14} aria-hidden="true" /> Inbox preview</h4>
        <label className="block text-xs text-muted">Subject
          <input className={field} value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className="block text-xs text-muted">Preview text
          <input className={field} value={preheader} onChange={(event) => setPreheader(event.target.value)} />
        </label>
        <div className="max-w-[300px] min-w-0 rounded-md bg-elevated px-3 py-2 text-sm">
          <p className="font-bold text-fg">BioHubNet</p>
          <p className="truncate font-semibold text-fg" title={subject}>{subject || "(No subject)"}</p>
          <p className="truncate text-xs text-muted" title={preheader}>{preheader || "(No preview text)"}</p>
        </div>
        <p className="text-xs text-muted">Browser preview only. Nothing is saved or sent.</p>
      </section>
      <section className="space-y-2 border-t border-line pt-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-fg"><ScanLine size={14} aria-hidden="true" /> HTML preflight</h4>
        <button
          type="button"
          disabled={!html}
          onClick={() => html && setRun({ html, result: checkNewsletterHtml(document, html) })}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg ring-1 ring-inset ring-line hover:bg-elevated disabled:opacity-50"
        >
          Check links and images
        </button>
        {!html && <p className="text-xs text-muted">No current layout to check.</p>}
        <div role="status" className="space-y-1 text-xs text-muted">
          {check && <>
            <p>{check.links} links and {check.images} images checked. {check.issues.length ? `${check.issues.length} findings.` : "No markup issues found."}</p>
            {!!check.issues.length && <ul className="list-disc space-y-1 pl-4 text-fg">
              {check.issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>}
            <p>Markup only. Link availability and delivery were not tested.</p>
          </>}
        </div>
      </section>
    </div>
  );
}
