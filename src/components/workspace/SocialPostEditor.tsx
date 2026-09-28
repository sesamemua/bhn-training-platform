"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { diffWordsWithSpace } from "diff";
import { Check, History, LoaderCircle, RotateCcw } from "lucide-react";
import type { SavedSocialText, SocialEditResponse, SocialTextChange } from "@/lib/social/edit-history";
import { SocialMarkedText } from "./SocialMarkedText";

function TextChanges({ before, after }: { before: string; after: string }) {
  return <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
    {diffWordsWithSpace(before, after).map((part, i) => part.added
      ? <ins key={i} className="bg-emerald-100 text-emerald-900 underline">{part.value}</ins>
      : part.removed
      ? <del key={i} className="bg-rose-100 text-rose-900">{part.value}</del>
      : <span key={i}>{part.value}</span>)}
  </p>;
}

export function SocialPostEditor({ post, label, onSaved, onDraftState }: {
  post: SavedSocialText;
  label: string;
  onSaved: (post: SavedSocialText) => void;
  onDraftState: (id: string, body: string, pending: boolean) => void;
}) {
  const [value, setValue] = useState(post.body);
  const [tracking, setTracking] = useState(post.trackChanges);
  const [state, setState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SavedSocialText | null>(null);
  const [changes, setChanges] = useState<SocialTextChange[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [markupBase, setMarkupBase] = useState(post.body);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(post);
  const latest = useRef({ body: post.body, trackChanges: post.trackChanges });
  const inFlight = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const readOnly = post.status === "published" || post.status === "skipped";

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [value, showChanges]);

  const save = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (blocked.current) return Promise.resolve();
    const run = async () => {
      while (latest.current.body !== saved.current.body || latest.current.trackChanges !== saved.current.trackChanges) {
        const snapshot = { ...latest.current };
        if (!snapshot.body.trim()) {
          setError("The post cannot be empty."); setState("error"); return;
        }
        setState("saving"); setError(null);
        try {
          const response = await fetch("/api/admin/social/posts", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "edit", id: post.id, ...snapshot, expectedVersion: saved.current.editVersion }),
            signal: AbortSignal.timeout(15000),
          });
          const result = await response.json() as SocialEditResponse;
          if (!response.ok || !result.post) {
            if (response.status === 409 && result.post) {
              blocked.current = true; setConflict(result.post);
            }
            throw new Error(result.error ?? "Changes could not be saved. Your text is still here.");
          }
          saved.current = result.post;
          // Apply server-normalized tags only if the person has not typed more while saving.
          if (latest.current.body === snapshot.body) {
            latest.current.body = result.post.body; setValue(result.post.body);
          }
          onSaved(result.post);
          if (result.change) setChanges((all) => [result.change!, ...all.filter((entry) => entry.id !== result.change!.id)].slice(0, 50));
          onDraftState(post.id, latest.current.body, latest.current.body !== saved.current.body || latest.current.trackChanges !== saved.current.trackChanges);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Changes could not be saved.");
          setState("error"); return;
        }
      }
      setState("saved"); onDraftState(post.id, latest.current.body, false);
    };
    inFlight.current = run().finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [post.id, onSaved, onDraftState]);

  useEffect(() => {
    const timer = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(timer);
  }, [value, tracking, save]);

  useEffect(() => {
    if (state === "saved") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  useEffect(() => {
    if (!historyOpen && !showChanges) return;
    let active = true;
    const bodyAtLoad = saved.current.body;
    fetch(`/api/admin/social/posts/${post.id}/history`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { changes?: SocialTextChange[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Couldn't load changes.");
        if (active) {
          setChanges((current) => [...new Map([...current, ...(result.changes ?? [])].map((item) => [item.id, item])).values()].sort((a, b) => b.version - a.version).slice(0, 50));
          if (showChanges && latest.current.body === bodyAtLoad) {
            setMarkupBase(result.changes?.find((change) => change.after === bodyAtLoad)?.before ?? bodyAtLoad);
          }
        }
      })
      .catch((e) => { if (active) setHistoryError(e instanceof Error ? e.message : "Couldn't load changes."); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [historyOpen, showChanges, post.id]);

  function changeText(body: string) {
    latest.current.body = body; setValue(body);
    setState("pending"); setError(null);
    onDraftState(post.id, body, true);
  }

  function resolveConflict(keepMine: boolean) {
    if (!conflict) return;
    saved.current = conflict; blocked.current = false; setConflict(null); setError(null);
    onSaved(conflict);
    if (!keepMine) {
      latest.current = { body: conflict.body, trackChanges: conflict.trackChanges };
      setValue(conflict.body); setTracking(conflict.trackChanges); setState("saved");
      onDraftState(post.id, conflict.body, false);
    } else { void save(); }
  }

  return <div>
    {showChanges ? <SocialMarkedText value={value} before={markupBase} label={label} readOnly={readOnly} onChange={changeText} onBlur={() => { void save(); }} /> : <textarea
      ref={textarea}
      value={value}
      onChange={(event) => changeText(event.target.value)}
      onBlur={() => { void save(); }}
      maxLength={6000}
      readOnly={readOnly}
      rows={Math.max(3, value.split("\n").length)}
      aria-label={`Post text for ${label}`}
      spellCheck
      className="block min-h-20 w-full resize-none overflow-hidden rounded-[2px] border-0 bg-transparent p-0 text-[16px] leading-[1.5] text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-[14px]"
    />}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[12px]">
      <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
        <input type="checkbox" role="switch" checked={tracking} disabled={readOnly || !!conflict} onChange={(event) => {
          latest.current.trackChanges = event.target.checked; setTracking(event.target.checked);
          setState("pending"); setError(null); onDraftState(post.id, latest.current.body, true);
        }} className="size-4 accent-brand-600" />
        Track changes
      </label>
      <label className="inline-flex cursor-pointer items-center gap-2 text-muted">
        <input type="checkbox" role="switch" checked={showChanges} onChange={(event) => {
          setShowChanges(event.target.checked);
          if (event.target.checked) {
            setMarkupBase(changes.find((change) => change.after === saved.current.body)?.before ?? saved.current.body);
            setHistoryLoading(true); setHistoryError(null);
          }
        }} className="size-4 accent-brand-600" />
        Show changes in post
      </label>
      <span role="status" className="inline-flex items-center gap-1 text-muted">
        {state === "saving" ? <><LoaderCircle size={13} className="animate-spin" /> Saving...</> : state === "saved" ? <><Check size={13} /> Saved</> : state === "pending" ? "Unsaved changes" : "Not saved"}
      </span>
    </div>
    {showChanges && historyError && <p role="alert" className="mt-2 text-[13px] text-rose-800">{historyError}</p>}
    {error && <div role="alert" className="mt-2 space-y-2 text-[13px] text-rose-800">
      <p>{error}</p>
      {!conflict && <button type="button" onClick={() => void save()} className="inline-flex items-center gap-1 font-semibold underline"><RotateCcw size={14} /> Retry save</button>}
    </div>}
    {conflict && <div className="mt-2 space-y-2 text-[13px]">
      <details><summary className="cursor-pointer font-semibold">Latest saved text</summary><p className="mt-2 whitespace-pre-wrap break-words">{conflict.body}</p></details>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => resolveConflict(false)} className="font-semibold text-brand-700 underline">Use latest saved text</button>
        {conflict.status !== "published" && conflict.status !== "skipped" && <button type="button" onClick={() => resolveConflict(true)} className="font-semibold text-brand-700 underline">Save my version</button>}
      </div>
    </div>}
    <details className="mt-2 border-t border-line pt-2 text-[12px]" onToggle={(event) => {
      setHistoryOpen(event.currentTarget.open);
      if (event.currentTarget.open) { setHistoryLoading(true); setHistoryError(null); }
    }}>
      <summary className="cursor-pointer font-semibold text-muted"><History size={13} className="mr-1 inline" /> Changes</summary>
      {historyLoading && <p className="mt-2 text-muted">Loading changes...</p>}
      {historyError && <p role="alert" className="mt-2 text-rose-800">{historyError}</p>}
      {!historyLoading && !historyError && changes.length === 0 && <p className="mt-2 text-muted">No tracked changes yet.</p>}
      <div className="max-h-96 overflow-y-auto">
        {changes.map((change) => <div key={change.id} className="space-y-2 border-b border-line py-3">
          <p className="font-semibold">{change.author} <time className="font-normal text-muted" dateTime={change.at}>{new Date(change.at).toLocaleString()}</time></p>
          <TextChanges before={change.before} after={change.after} />
          {!readOnly && <button type="button" disabled={state !== "saved"} onClick={() => changeText(change.before)} className="inline-flex items-center gap-1 font-semibold text-brand-700 disabled:opacity-40"><RotateCcw size={13} /> Restore text before this edit</button>}
        </div>)}
      </div>
    </details>
  </div>;
}
