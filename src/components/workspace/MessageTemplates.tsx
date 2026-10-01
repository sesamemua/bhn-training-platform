"use client";

/**
 * The Messages tab: one template, edited on the left and saved as you go;
 * on the right, the message as each person will get it, filled in from
 * the Filming day. Copy it, or open it in your own email — nothing is
 * sent from the platform.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Mail, RotateCcw } from "lucide-react";
import { DEFAULT_TEMPLATE, FIELDS, fill, type Template } from "@/lib/video/messages";
import { saveMessageTemplate } from "@/lib/video/printout-actions";

export interface MessageRecipient { id: string; name: string; email: string; fields: Record<string, string>; missing: string[] }
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-brand-400 disabled:opacity-40";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={BTN} onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? <><Check size={12} className="text-emerald-600" /> Copied</> : <><Copy size={12} /> {label}</>}
    </button>
  );
}

export function MessageTemplates({ projectId, initial, recipients }: { projectId: string; initial: Template; recipients: MessageRecipient[] }) {
  const [tpl, setTpl] = useState(initial);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      saveMessageTemplate(projectId, tpl).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 700);
    return () => clearTimeout(t);
  }, [tpl, projectId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-2 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[14px] font-bold text-fg">Template</h2>
          <span className="text-[11.5px] text-subtle" role="status">
            {status === "saving" ? <><Loader2 size={11} className="inline animate-spin" /> Saving…</> : status === "error" ? <span className="text-rose-600">Not saved — check the subject and message aren&apos;t empty</span> : "Saved"}
          </span>
          <button type="button" className={`${BTN} ml-auto`} onClick={() => setTpl(DEFAULT_TEMPLATE)} disabled={tpl.subject === DEFAULT_TEMPLATE.subject && tpl.body === DEFAULT_TEMPLATE.body}>
            <RotateCcw size={12} /> Start from the original
          </button>
        </div>
        <label className="block text-[12px] font-semibold text-muted">Subject
          <input id="msg-subject" value={tpl.subject} maxLength={200} onChange={(e) => setTpl({ ...tpl, subject: e.target.value })} className="mt-0.5 w-full rounded-md border border-line bg-card-solid px-2 py-1.5 text-[13px] text-fg focus:border-brand-400 focus:outline-none" />
        </label>
        <label className="block text-[12px] font-semibold text-muted">Message
          <textarea id="msg-body" value={tpl.body} maxLength={8000} rows={26} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} className="mt-0.5 w-full resize-y rounded-md border border-line bg-card-solid px-2 py-1.5 font-mono text-[12.5px] leading-relaxed text-fg focus:border-brand-400 focus:outline-none" />
        </label>
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer font-semibold text-fg">Fields you can use</summary>
          <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {FIELDS.map(([k, what]) => <li key={k}><code className="text-fg">{`{${k}}`}</code> — {what}</li>)}
          </ul>
        </details>
      </section>

      <section className="space-y-3">
        {recipients.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">Nobody in the Interviewees group on the Filming day yet.</p>}
        {recipients.map((r) => {
          const subject = fill(tpl.subject, r.fields), body = fill(tpl.body, r.fields);
          return (
            <article key={r.id} className="rounded-xl border border-line bg-card p-3">
              <header className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14px] font-bold text-fg">{r.name}</h3>
                <span className="text-[12px] text-muted">{r.email || "no email"}</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <CopyButton text={subject} label="Copy subject" />
                  <CopyButton text={body} label="Copy message" />
                  <a
                    className={`${BTN} ${r.email ? "" : "pointer-events-none opacity-40"}`}
                    href={r.email ? `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : undefined}
                    aria-disabled={!r.email}
                  >
                    <Mail size={12} /> Open in email
                  </a>
                </div>
              </header>
              {r.missing.length > 0 && <p className="mt-1 text-[12px] font-semibold text-amber-600">Missing on the Filming day: {r.missing.join(", ")}. The gaps show in [brackets].</p>}
              <p className="mt-2 text-[12.5px] font-semibold text-fg">{subject}</p>
              <pre className="mt-1 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-lg bg-elevated/50 p-2.5 font-sans text-[12.5px] leading-relaxed text-fg">{body}</pre>
            </article>
          );
        })}
        <p className="text-[11.5px] text-subtle">Nothing is sent from here. &ldquo;Open in email&rdquo; starts the message in your own email; you send it.</p>
      </section>
    </div>
  );
}
