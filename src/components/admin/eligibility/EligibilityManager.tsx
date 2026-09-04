"use client";

/**
 * Load the programme lists Training Week registration is checked
 * against.
 *
 * The API for this already existed and had no screen, which meant the
 * eligibility feature shipped switched off with no way to switch it on.
 * This is that way.
 *
 * Paste rather than upload on purpose: the three sources are a Google
 * Sheet and two SharePoint workbooks that nobody here can read
 * programmatically today. Select-all, copy, paste. The server takes
 * every address it can find in the text, so a renamed column does not
 * break an import.
 */
import { useState } from "react";
import { Loader2, ShieldCheck, ShieldAlert, Upload, AlertTriangle, ExternalLink, Check } from "lucide-react";

interface Source {
  id: string; name: string; note: string; url: string;
  programmes: string[]; count: number;
}
interface Gate { enforcing: boolean; reason: string; stale: boolean }
interface ImportRow {
  id: string; sourceId: string; rowsRead: number; rowsAccepted: number;
  rowsSkipped: number; error: string | null; createdAt: string;
}
export interface EligibilityState {
  gate: Gate; total: number;
  sources: Source[]; imports: ImportRow[];
}

export function EligibilityManager({ initial }: { initial: EligibilityState }) {
  const [state, setState] = useState<EligibilityState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  /** Re-read after an import. An event, not a render. */
  async function load() {
    const res = await fetch("/api/admin/eligibility");
    if (res.ok) setState((await res.json()) as EligibilityState);
  }

  async function importPaste(sourceId: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/eligibility", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, text: paste }),
      });
      const j = (await res.json()) as { error?: string; imported?: number; skipped?: number };
      if (!res.ok) throw new Error(j.error ?? "The import was not accepted.");
      setResult(`Imported ${j.imported} address${j.imported === 1 ? "" : "es"}${j.skipped ? `, skipped ${j.skipped} line${j.skipped === 1 ? "" : "s"} with no address` : ""}.`);
      setPaste("");
      setOpenId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  const g = state.gate;

  return (
    <div className="space-y-4">
      {/* The single most important fact on this page: is anybody
          actually being turned away right now? */}
      <div className={`rounded-xl border-2 p-4 ${g.enforcing ? "border-emerald-500/50 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10"}`}>
        <p className={`flex items-center gap-2 text-[14px] font-bold ${g.enforcing ? "text-emerald-700" : "text-amber-700"}`}>
          {g.enforcing ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
          {g.enforcing ? "The check is ON — people not on a list are refused" : "The check is OFF — nobody is being refused"}
        </p>
        <p className={`mt-1.5 text-[12.5px] leading-relaxed ${g.enforcing ? "text-emerald-800" : "text-amber-800"}`}>{g.reason}</p>
        {g.stale && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
            <AlertTriangle size={13} /> Re-import before registration opens — anyone accepted since the last import will be turned away.
          </p>
        )}
      </div>

      {error && <p className="rounded-lg border border-rose-300 bg-rose-50/60 p-3 text-[12.5px] font-medium text-rose-800">{error}</p>}
      {result && <p className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 text-[12.5px] font-medium text-emerald-800"><Check size={13} /> {result}</p>}

      <ul className="space-y-3">
        {state.sources.map((s) => (
          <li key={s.id} className="rounded-xl border border-line bg-card-solid p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-fg">{s.name}</p>
                <p className="mt-0.5 text-[12px] text-muted">{s.note}</p>
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-700 hover:underline">
                  <ExternalLink size={11} /> Open the source
                </a>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold tabular-nums ${s.count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-elevated text-subtle"}`}>
                  {s.count} loaded
                </span>
                <button
                  type="button"
                  onClick={() => { setOpenId(openId === s.id ? null : s.id); setPaste(""); setResult(null); }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700"
                >
                  <Upload size={12} /> {s.count > 0 ? "Re-import" : "Import"}
                </button>
              </div>
            </div>

            {openId === s.id && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[12px] text-muted">
                  Open the sheet, select everything, copy, and paste it here. Every address in the text is taken — the column order and headers do not matter.
                </p>
                <textarea
                  autoFocus
                  rows={7}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Paste the whole sheet here…"
                  className="mt-2 w-full rounded-lg border border-line bg-elevated/40 px-3 py-2 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <p className="mt-1 text-[11.5px] text-subtle">
                  This <strong>replaces</strong> {s.name}&apos;s rows — somebody removed from the programme stops being eligible. Anyone you added by hand is kept. The other lists are untouched.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => importPaste(s.id)}
                    disabled={busy || paste.trim().length === 0}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import this list
                  </button>
                  <button type="button" onClick={() => setOpenId(null)} className="px-3 py-2 text-[12.5px] font-semibold text-muted hover:text-fg">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {state.imports.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Recent imports</p>
          <ul className="mt-1.5 space-y-1">
            {state.imports.map((im) => (
              <li key={im.id} className="flex flex-wrap items-center gap-x-3 text-[11.5px] text-muted">
                <span className="tabular-nums">{new Date(im.createdAt).toLocaleString()}</span>
                <span className="font-semibold text-fg">{im.sourceId}</span>
                {im.error
                  ? <span className="text-rose-700">failed — {im.error}</span>
                  : <span>{im.rowsAccepted} accepted{im.rowsSkipped ? ` · ${im.rowsSkipped} skipped` : ""}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
