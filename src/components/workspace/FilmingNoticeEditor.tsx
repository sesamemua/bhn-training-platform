"use client";

/**
 * The shoot day's signs. Each is a thumbnail of the real page; pick one,
 * edit it, and the preview beside it is exactly what the Print button
 * prints. New sign makes one from scratch. Every change is saved on its
 * own a moment after you stop typing, so the signs are there next time.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Printer, X } from "lucide-react";
import { noticeHtml, type Sign } from "@/lib/video/filming-notice";
import { savePrintouts } from "@/lib/video/printout-actions";

type Fields = Sign["fields"];
const INPUT = "w-full rounded-md border border-line bg-card px-2 py-1.5 text-[13px] text-fg focus:border-brand-400 focus:outline-none";
// Relative is enough: preview frames and the print window take this page's address as their base.
const LOGO = "/biohubnet-logo.png";

/** A page at 96 dpi is 816 × 1056; `w` is the width it is shown at. */
function Page({ fields, w }: { fields: Fields; w: number }) {
  const html = useMemo(() => noticeHtml({ ...fields, logoUrl: LOGO }, { preview: true }), [fields]);
  const scale = w / 816;
  return (
    <div className="relative overflow-hidden rounded bg-white" style={{ width: w, height: Math.round(1056 * scale) }}>
      <iframe
        title="Sign preview"
        srcDoc={html}
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: 816, height: 1056, transform: `scale(${scale})` }}
      />
    </div>
  );
}

export function FilmingNoticeEditor({ projectId, builtIn, initial }: { projectId: string; builtIn: Sign[]; initial: Sign[] }) {
  const [signs, setSigns] = useState<Sign[]>(initial);
  const [which, setWhich] = useState(initial[0]?.id ?? "");
  const [blocked, setBlocked] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const sign = signs.find((s) => s.id === which) ?? signs[0];

  // Save a moment after the last change.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus("saving");
    const t = setTimeout(() => {
      savePrintouts(projectId, signs).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 800);
    return () => clearTimeout(t);
  }, [signs, projectId]);

  const update = (patch: Partial<Sign> & { fields?: Fields }) =>
    setSigns((all) => all.map((s) => (s.id === sign.id ? { ...s, ...patch } : s)));
  const setField = (key: keyof Fields, v: string) => update({ fields: { ...sign.fields, [key]: v } });

  function addSign() {
    const id = `custom-${Date.now().toString(36)}`;
    const base = builtIn[0]?.fields;
    const fields: Fields = {
      subhead: base?.subhead ?? "Filming in progress",
      headline: "Your heading here",
      when: base?.when ?? "",
      where: base?.where ?? "",
      message: "",
      thanks: "Thank you!",
    };
    setSigns((all) => [...all, { id, label: "New sign", custom: true, fields }]);
    setWhich(id);
  }
  function removeSign(s: Sign) {
    if (!confirm(`Delete the sign “${s.label}”?`)) return;
    setSigns((all) => all.filter((x) => x.id !== s.id));
    if (which === s.id) setWhich(signs[0]?.id ?? "");
  }
  function print() {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    w.document.write(noticeHtml({ ...sign.fields, logoUrl: LOGO }, { print: true }));
    w.document.close();
  }

  const field = (key: keyof Fields, label: string, rows = 0) => (
    <label className="block text-[11.5px] font-semibold text-muted">
      {label}
      {rows ? (
        <textarea id={`sign-${sign.id}-${key}`} rows={rows} className={INPUT} value={sign.fields[key]} onChange={(e) => setField(key, e.target.value)} />
      ) : (
        <input id={`sign-${sign.id}-${key}`} className={INPUT} value={sign.fields[key]} onChange={(e) => setField(key, e.target.value)} />
      )}
    </label>
  );

  if (!sign) return null;
  const original = builtIn.find((b) => b.id === sign.id);

  return (
    <div className="space-y-5">
      {/* The signs, as the pages they are. */}
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[14px] font-bold text-fg">Signs for the door</p>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle" role="status">
            {status === "saving" ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
              : status === "error" ? <span className="text-rose-600">Not saved — try again</span>
              : <><Check size={11} className="text-emerald-500" /> Saved</>}
          </span>
        </div>
        <div className="mt-2 flex gap-3 overflow-x-auto pb-2" role="tablist" aria-label="Signs">
          {signs.map((s) => (
            <div key={s.id} className="relative shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={s.id === sign.id}
                onClick={() => setWhich(s.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-colors ${
                  s.id === sign.id ? "border-brand-500 bg-brand-500/10" : "border-line hover:border-brand-400/60"
                }`}
              >
                <Page fields={s.fields} w={132} />
                <span className="max-w-[132px] truncate text-[12px] font-semibold text-fg">{s.label}</span>
              </button>
              {s.custom && (
                <button
                  type="button"
                  onClick={() => removeSign(s)}
                  aria-label={`Delete the sign ${s.label}`}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border border-line bg-card-solid text-subtle hover:text-rose-500"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addSign}
            className="flex w-[152px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line text-muted hover:border-brand-400 hover:text-fg"
            style={{ minHeight: 210 }}
          >
            <Plus size={22} />
            <span className="text-[12.5px] font-semibold">New sign</span>
          </button>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-3">
          <label className="block text-[11.5px] font-semibold text-muted">
            Name of this sign
            <input id={`sign-${sign.id}-label`} className={INPUT} value={sign.label} maxLength={60} onChange={(e) => update({ label: e.target.value })} />
          </label>
          {field("subhead", "Small heading")}
          {field("headline", "Big heading")}
          {field("when", "When")}
          {field("where", "Where")}
          {field("message", "Message", 4)}
          {field("thanks", "Sign-off")}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={print} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700">
              <Printer size={14} /> Print
            </button>
            {original && (
              <button type="button" onClick={() => update({ fields: original.fields, label: original.label })} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-fg hover:bg-elevated">
                Reset the words
              </button>
            )}
          </div>
          {blocked && <p role="alert" className="text-[12.5px] font-semibold text-amber-600">Your browser blocked the print window. Allow pop-ups for this site, then press Print again.</p>}
          <p className="text-[11.5px] text-subtle">Letter paper, portrait. Changes save on their own.</p>
        </div>
        <div className="rounded-xl border border-line bg-elevated/40 p-4">
          <div className="mx-auto w-fit shadow-md"><Page fields={sign.fields} w={530} /></div>
        </div>
      </section>
    </div>
  );
}
