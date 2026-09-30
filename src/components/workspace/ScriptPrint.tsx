"use client";

/**
 * Print the scripts: every tab of every script in the project, pulled
 * live from the Scripts page each time this opens (nothing is copied or
 * frozen here), laid out for reading on paper — one section per tab,
 * each starting on a new page, with a contents page first. Tick which
 * tabs to include; Print opens the browser's print window, where "Save
 * as PDF" makes the PDF.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileText, Printer, RefreshCw } from "lucide-react";
import { HIDE_DIRECTIONS_CSS } from "@/lib/scripts/directions";

export interface PrintableScript { id: string; title: string; updatedAt: string; html: string; css: string }
interface Part { key: string; script: string; label: string; html: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The tabs of a script, each with its own content (nested tabs come out as their own parts). */
function partsOf(s: PrintableScript): Part[] {
  const doc = new DOMParser().parseFromString(`<div id="root">${s.html}</div>`, "text/html");
  const root = doc.getElementById("root")!;
  // Editing furniture never prints.
  root.querySelectorAll("script, style, button, input, textarea, select, nav, .doc-tabs, [role=tablist]").forEach((n) => n.remove());
  root.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  const panels = [...root.querySelectorAll<HTMLElement>(".doc-panel")];
  if (!panels.length) return [{ key: s.id, script: s.title, label: s.title, html: root.innerHTML }];
  return panels.flatMap((p, i) => {
    const own = p.cloneNode(true) as HTMLElement;
    own.querySelectorAll(".doc-panel").forEach((n) => n.remove());
    if (!own.textContent?.trim()) return [];
    return [{ key: `${s.id}:${p.dataset.tab ?? i}`, script: s.title, label: p.dataset.label || p.dataset.tab || `Part ${i + 1}`, html: own.innerHTML }];
  });
}

function bookHtml(title: string, parts: Part[], css: string, print: boolean, directions = false): string {
  const printed = new Date().toLocaleString("en-CA", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — scripts</title>
<style>${css}</style>
<style>
@page { size: letter portrait; margin: .8in .85in }
html, body { background: #fff !important; color: #111 !important }
body { font: 12pt/1.6 Georgia, "Times New Roman", serif; margin: 0; padding: ${print ? "0" : ".4in"} }
.cover { break-after: page; padding-top: 2in }
.cover h1 { font: 700 26pt/1.15 "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0 }
.cover p { font: 11pt "Helvetica Neue", Helvetica, Arial, sans-serif; color: #555; margin: .1in 0 0 }
.cover ol { margin-top: .4in; font: 12pt/1.9 "Helvetica Neue", Helvetica, Arial, sans-serif }
.part { break-before: page }
.part-head { font: 700 9pt "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #1f4b5b; border-bottom: 1.5px solid #1f4b5b; padding-bottom: .06in; margin-bottom: .25in }
/* The screen layout flattened for paper: one column, no cards, no colour fills. */
.part * { box-shadow: none !important; background: transparent !important; max-width: none !important }
.part .top-grid, .part .guide-grid, .part .overview-grid, .part .intercut-list, .part .prompt-list { display: block !important }
.part .box, .part article { border: 0 !important; padding: 0 !important; margin: 0 0 .28in !important; break-inside: auto }
.part h1 { font: 700 18pt/1.2 "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0 0 .1in }
.part h2 { font: 700 13pt/1.3 "Helvetica Neue", Helvetica, Arial, sans-serif; margin: .2in 0 .08in; break-after: avoid }
.part h3 { font: 700 11.5pt/1.3 "Helvetica Neue", Helvetica, Arial, sans-serif; margin: .15in 0 .06in; break-after: avoid }
.part .label, .part .tab-meta, .part .small { font: 8.5pt "Helvetica Neue", Helvetica, Arial, sans-serif; color: #666; text-transform: uppercase; letter-spacing: .08em }
.part .intro, .part .note, .part .script-note, .part .visual-note, .part .cue { font-size: 10.5pt; color: #444; font-style: italic }
.part .script-lines p, .part .script-copy p, .part .full-script p { font-size: 13.5pt; line-height: 1.75; margin: 0 0 .12in }
.part .speaker { font: 700 10pt "Helvetica Neue", Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: .06em }
.part p, .part li { orphans: 3; widows: 3 }
${directions ? "" : HIDE_DIRECTIONS_CSS}
</style></head><body>
<section class="cover"><h1>${esc(title)}</h1><p>Scripts · printed ${esc(printed)} · the current version from the Scripts page</p>
<ol>${parts.map((p) => `<li>${esc(p.label)}</li>`).join("")}</ol></section>
${parts.map((p) => `<section class="part"><div class="part-head">${esc(p.script)} · ${esc(p.label)}</div>${p.html}</section>`).join("\n")}
${print ? `<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>` : ""}
</body></html>`;
}

export function ScriptPrint({ projectTitle, scripts }: { projectTitle: string; scripts: PrintableScript[] }) {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState(false);
  // Just the script unless asked: visuals, notes and cues left off the paper.
  const [directions, setDirections] = useState(false);
  useEffect(() => { setParts(scripts.flatMap(partsOf)); }, [scripts]);

  const chosen = parts.filter((p) => !off.has(p.key));
  const css = scripts.map((s) => s.css).join("\n");
  const preview = useMemo(() => bookHtml(projectTitle, chosen, css, false, directions), [projectTitle, chosen, css, directions]);
  const newest = scripts.map((s) => s.updatedAt).sort().at(-1);

  function print() {
    const w = window.open("", "_blank");
    if (!w) return setBlocked(true);
    setBlocked(false);
    w.document.write(bookHtml(projectTitle, chosen, css, true, directions));
    w.document.close();
  }
  const toggle = (k: string) => setOff((s) => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n; });

  if (!scripts.length) {
    return <p className="rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">This project has no scripts to print yet.</p>;
  }
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-fg"><FileText size={15} /> Scripts</p>
        <p className="text-[12px] text-muted">
          Pulled live from the Scripts page — each tab on its own pages, laid out for reading on paper.
          {newest && <> Last changed {new Date(newest).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</>}
        </p>
        <ul className="space-y-1 rounded-lg border border-line bg-card p-2">
          {parts.map((p) => (
            <li key={p.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[12.5px] text-fg hover:bg-elevated/60">
                <input type="checkbox" checked={!off.has(p.key)} onChange={() => toggle(p.key)} className="accent-brand-600" />
                {p.label}
                {scripts.length > 1 && <span className="ml-auto truncate text-[10.5px] text-subtle">{p.script}</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={print} disabled={!chosen.length} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            <Printer size={14} /> Print or save as PDF
          </button>
          <button type="button" onClick={() => setDirections((v) => !v)} aria-pressed={directions} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold ${directions ? "border-brand-500 bg-brand-500/10 text-fg" : "border-line text-muted hover:bg-elevated hover:text-fg"}`}>
            {directions ? <Eye size={13} /> : <EyeOff size={13} />} {directions ? "Visuals & notes shown" : "Just the script"}
          </button>
          <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[12.5px] font-semibold text-fg hover:bg-elevated">
            <RefreshCw size={13} /> Pull the latest
          </button>
        </div>
        {blocked && <p role="alert" className="text-[12.5px] font-semibold text-amber-600">Your browser blocked the print window. Allow pop-ups for this site, then try again.</p>}
        <p className="text-[11.5px] text-subtle">In the print window, choose <strong>Save as PDF</strong> to make a PDF. {chosen.length} of {parts.length} parts.</p>
      </div>
      <div className="rounded-xl border border-line bg-elevated/40 p-3">
        <iframe title="Scripts preview" srcDoc={preview} className="h-[720px] w-full rounded bg-white" />
      </div>
    </section>
  );
}
