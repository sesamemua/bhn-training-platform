"use client";

/**
 * Edit the signature, and see it as a recipient will — both ways.
 *
 * Plain text and HTML are both drawn from what is typed, by the same
 * functions sendMail uses, so the preview is the email and not an
 * impression of it.
 */
import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, RotateCcw, Save } from "lucide-react";
import { resetSignature, saveSignature } from "@/app/(dashboard)/admin/email-signature/actions";
import {
  cleanSignature, SIGNATURE_MAX_CHARS, SIGNATURE_MAX_LINES, signatureHtml, signatureProblem,
} from "@/lib/mail-signature";

export function SignatureEditor({ initial, original }: { initial: string; original: string }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const problem = signatureProblem(text);
  const changed = cleanSignature(text) !== saved;
  const isOriginal = saved === original;
  const html = useMemo(() => signatureHtml(cleanSignature(text) || " "), [text]);

  function save() {
    start(async () => {
      const r = await saveSignature(text);
      if (!r.ok) { setSaid(r.problem ?? "That was not saved."); return; }
      setSaved(r.signature ?? cleanSignature(text));
      setText(r.signature ?? cleanSignature(text));
      setSaid("Saved. Emails sent from now on end with this — give it a minute to reach every server.");
    });
  }
  function reset() {
    if (!confirm("Put back the original signature? Your version is kept in the audit log.")) return;
    start(async () => {
      const r = await resetSignature();
      setSaved(r.signature);
      setText(r.signature);
      setSaid("The original signature is back.");
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-card-solid p-4">
        <label htmlFor="signature" className="text-[11px] font-bold uppercase tracking-wide text-subtle">Signature</label>
        <textarea
          id="signature"
          rows={10}
          value={text}
          onChange={(e) => { setText(e.target.value); setSaid(null); }}
          className="mt-1.5 w-full rounded-lg border border-line bg-elevated/40 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-fg focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <p className="mt-1 text-[11.5px] leading-snug text-subtle">
          One line per line. Web addresses and email addresses become links. The first line is shown in bold.
          Up to {SIGNATURE_MAX_LINES} lines and {SIGNATURE_MAX_CHARS} characters.
        </p>
        {problem && <p className="mt-2 text-[12px] font-semibold text-rose-700">{problem}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !changed || Boolean(problem)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save signature
          </button>
          {changed && (
            <button type="button" onClick={() => { setText(saved); setSaid(null); }} className="px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-fg">
              Undo changes
            </button>
          )}
          {!isOriginal && (
            <button type="button" onClick={reset} disabled={pending}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-fg disabled:opacity-50">
              <RotateCcw size={12} /> Put back the original
            </button>
          )}
        </div>
        {said && (
          <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
            <Check size={13} className="text-emerald-600" /> {said}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="rounded-xl border border-line bg-card-solid p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">In most email apps</p>
          <div className="mt-2 rounded-lg bg-white p-4 text-[13px] text-slate-800">
            <p>Hello Ana,</p>
            <p className="mt-2">Your place at Negotiation Navigator is confirmed.</p>
            {/* The exact HTML sendMail appends, built from what is typed —
                everything in it is escaped first, so nothing here runs. */}
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card-solid p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">As plain text</p>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-elevated/50 p-3 font-mono text-[12px] leading-relaxed text-muted">
{`Hello Ana,

Your place at Negotiation Navigator is confirmed.

-- 
${cleanSignature(text)}`}
          </pre>
        </div>
      </section>
    </div>
  );
}
