"use client";

/**
 * Edit the door notice and see it exactly as it prints: the preview is the
 * same page the Print button opens. Nothing is saved — the words come from
 * the filming day each time, and changes are for this printout.
 */
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { noticeHtml, type Notice } from "@/lib/video/filming-notice";

type Fields = Omit<Notice, "logoUrl">;
const INPUT = "w-full rounded-md border border-line bg-card px-2 py-1.5 text-[13px] text-fg focus:border-brand-400 focus:outline-none";

export function FilmingNoticeEditor({ initial }: { initial: Fields }) {
  const [f, setF] = useState(initial);
  const [blocked, setBlocked] = useState(false);
  // Relative is enough: the preview frame and the print window both take this page's address as their base.
  const logoUrl = "/biohubnet-logo.png";
  const preview = useMemo(() => noticeHtml({ ...f, logoUrl }, { preview: true }), [f]);

  function print() {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    w.document.write(noticeHtml({ ...f, logoUrl }, { print: true }));
    w.document.close();
  }
  const field = (key: keyof Fields, label: string, rows = 0) => (
    <label className="block text-[11.5px] font-semibold text-muted">
      {label}
      {rows ? (
        <textarea id={`notice-${key}`} rows={rows} className={INPUT} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      ) : (
        <input id={`notice-${key}`} className={INPUT} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      )}
    </label>
  );

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-3">
        <p className="text-[14px] font-bold text-fg">Filming notice for the door</p>
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
          <button type="button" onClick={() => setF(initial)} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-fg hover:bg-elevated">
            Reset the words
          </button>
        </div>
        {blocked && <p role="alert" className="text-[12.5px] font-semibold text-amber-600">Your browser blocked the print window. Allow pop-ups for this site, then press Print again.</p>}
        <p className="text-[11.5px] text-subtle">Letter paper, portrait. Changes here are for this printout only.</p>
      </div>
      {/* Letter at 96 dpi is 816 × 1056; shown at 65%. */}
      <div className="rounded-xl border border-line bg-elevated/40 p-4">
        <div className="relative mx-auto overflow-hidden rounded bg-white shadow-md" style={{ width: 530, height: 686 }}>
          <iframe title="Filming notice preview" srcDoc={preview} className="absolute left-0 top-0 origin-top-left border-0" style={{ width: 816, height: 1056, transform: "scale(0.65)" }} />
        </div>
      </div>
    </section>
  );
}
