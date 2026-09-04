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
import { Loader2, ShieldCheck, ShieldAlert, Upload, AlertTriangle, ExternalLink, Check, UserPlus } from "lucide-react";

interface Source {
  id: string; name: string; note: string; url: string;
  programmes: string[]; count: number;
}
interface Gate { enforcing: boolean; reason: string; stale: boolean }
interface ImportRow {
  id: string; sourceId: string; rowsRead: number; rowsAccepted: number;
  rowsSkipped: number; addedEmails: string[]; removedEmails: string[];
  error: string | null; createdAt: string;
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
  /* Adding one person by hand. The lists are exported periodically, so
     somebody accepted this week is on no sheet yet and is refused at the
     email question — this is how a coordinator lets them in without
     waiting for the next export. Hand-added rows survive a re-import. */
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addSource, setAddSource] = useState(initial.sources[0]?.id ?? "");

  /** Re-read after an import. An event, not a render. */
  async function load() {
    const res = await fetch("/api/admin/eligibility");
    if (res.ok) setState((await res.json()) as EligibilityState);
  }

  async function addByHand() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, name: addName, sourceId: addSource, note: "Added by hand" }),
      });
      const j = (await res.json()) as { error?: string; entry?: { email: string } };
      if (!res.ok) throw new Error(j.error ?? "Could not add them.");
      setResult(`${j.entry?.email} can register now.`);
      setAddEmail(""); setAddName(""); setAddOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add them.");
    } finally {
      setBusy(false);
    }
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
      const j = (await res.json()) as { error?: string; imported?: number; skipped?: number; added?: string[]; removed?: string[] };
      if (!res.ok) throw new Error(j.error ?? "The import was not accepted.");
      const a = j.added?.length ?? 0, r = j.removed?.length ?? 0;
      setResult(
        `${j.imported} address${j.imported === 1 ? "" : "es"} on the list. `
        + (a === 0 && r === 0
            ? "Nothing changed since the last import."
            : `${a} new${r ? `, ${r} no longer on it` : ""}.`),
      );
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

      <div className="rounded-xl border border-line bg-card-solid p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] font-bold text-fg">Someone refused who should not have been?</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              A trainee accepted since the last export is on no sheet yet. Add them here and they can register immediately — a re-import will not remove them.
            </p>
          </div>
          {(
            <button
              type="button"
              onClick={() => { setAddOpen(!addOpen); setResult(null); setError(null); }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-1.5 text-[12px] font-bold text-fg hover:bg-elevated"
            >
              <UserPlus size={13} /> Add one person
            </button>
          )}
        </div>
        {addOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <label className="block min-w-[15rem] flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">Their email</span>
              <input
                autoFocus
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addEmail.trim()) addByHand(); }}
                placeholder="name@utoronto.ca"
                className="mt-1 w-full rounded-md border border-line bg-elevated/40 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="block min-w-[10rem]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">Name (optional)</span>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-elevated/40 px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
            <label className="block min-w-[12rem]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-subtle">Which programme</span>
              <select
                value={addSource}
                onChange={(e) => setAddSource(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-elevated/40 px-2.5 py-1.5 text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {state.sources.map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={addByHand}
              disabled={busy || !addEmail.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Add
            </button>
          </div>
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
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">What each import changed</p>
          <ul className="mt-1.5 space-y-1.5">
            {state.imports.map((im) => {
              const added = im.addedEmails ?? [];
              const removed = im.removedEmails ?? [];
              return (
                <li key={im.id} className="rounded-lg border border-line bg-card-solid px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 text-[11.5px]">
                    <span className="tabular-nums text-muted">{new Date(im.createdAt).toLocaleString()}</span>
                    <span className="font-semibold text-fg">{im.sourceId}</span>
                    {im.error ? (
                      <span className="font-semibold text-rose-700">failed — {im.error}</span>
                    ) : (
                      <>
                        <span className="tabular-nums text-muted">{im.rowsAccepted} on the list</span>
                        {added.length > 0 && <span className="font-bold text-emerald-700">+{added.length} new</span>}
                        {removed.length > 0 && <span className="font-bold text-rose-700">−{removed.length} gone</span>}
                        {added.length === 0 && removed.length === 0 && <span className="text-subtle">no change</span>}
                      </>
                    )}
                  </div>
                  {(added.length > 0 || removed.length > 0) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] font-semibold text-muted hover:text-fg">Who</summary>
                      {added.length > 0 && (
                        <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
                          <strong>Added:</strong> {added.join(", ")}
                        </p>
                      )}
                      {removed.length > 0 && (
                        <p className="mt-1 text-[11px] leading-relaxed text-rose-800">
                          <strong>No longer on the list:</strong> {removed.join(", ")}
                        </p>
                      )}
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
