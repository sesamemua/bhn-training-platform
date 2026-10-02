"use client";

/**
 * Record an answer, as many takes as you like: each take can be played
 * back or deleted, and one is chosen to send (the newest, until you pick
 * another). A take stops itself at the time limit. Nothing leaves the
 * browser until the form is submitted — and then only the chosen take.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Mic, Square, Trash2 } from "lucide-react";

export interface Take { id: string; blob: Blob; url: string; seconds: number }

/** The first format this browser can record — Safari records mp4, Chrome and Firefox webm/ogg. */
function recordingType(): string | undefined {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!MR?.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MR.isTypeSupported(t));
}

export function VoiceTakes({ maxSeconds, onChosen, disabled }: {
  maxSeconds: number;
  /** The take to send, or null when there is none. */
  onChosen: (take: Take | null) => void;
  disabled?: boolean;
}) {
  const [takes, setTakes] = useState<Take[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; started: number; timer: ReturnType<typeof setInterval> } | null>(null);
  const takesRef = useRef(takes);
  takesRef.current = takes;

  // Let go of the microphone and the take URLs when this goes away.
  useEffect(() => () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    if (rec.current) clearInterval(rec.current.timer);
    takesRef.current.forEach((t) => URL.revokeObjectURL(t.url));
  }, []);

  const choose = (id: string | null, list = takes) => {
    setChosen(id);
    onChosen(list.find((t) => t.id === id) ?? null);
  };

  const stop = () => {
    const r = rec.current;
    if (r && r.mr.state !== "inactive") r.mr.stop();
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("This browser can't record here — type your answer instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("We couldn't use your microphone. Allow microphone access for this page, or type your answer instead.");
      return;
    }
    const type = recordingType();
    const mr = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const r = rec.current;
      if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); }
      const seconds = r ? Math.min(maxSeconds, Math.round((Date.now() - r.started) / 1000)) : 0;
      rec.current = null;
      setRecording(false);
      if (!chunks.length) return;
      const blob = new Blob(chunks, { type: mr.mimeType || type || "audio/webm" });
      const take: Take = { id: `t${Date.now()}`, blob, url: URL.createObjectURL(blob), seconds };
      const next = [...takesRef.current, take];
      setTakes(next);
      choose(take.id, next);
    };
    const started = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= maxSeconds) stop();
    }, 250);
    rec.current = { mr, stream, started, timer };
    setElapsed(0);
    setRecording(true);
    mr.start();
  };

  const remove = (id: string) => {
    const t = takes.find((x) => x.id === id);
    if (t) URL.revokeObjectURL(t.url);
    const next = takes.filter((x) => x.id !== id);
    setTakes(next);
    if (chosen === id) choose(next.at(-1)?.id ?? null, next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 rounded-lg bg-[#be123c] px-3 py-1.5 text-[13px] font-semibold text-white">
            <Square size={13} fill="currentColor" /> Stop
          </button>
        ) : (
          <button type="button" onClick={start} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#1f2937] hover:border-[#0e7da3] disabled:opacity-50">
            <Mic size={14} /> {takes.length ? "Record another take" : "Record"}
          </button>
        )}
        <span className={`text-[12px] tabular-nums ${recording ? "font-semibold text-[#be123c]" : "text-[#475569]"}`} aria-live="polite">
          {recording ? `Recording… ${maxSeconds - elapsed}s left` : `Up to ${maxSeconds} seconds per take`}
        </span>
      </div>
      {error && <p className="text-[12px] font-semibold text-[#881337]">{error}</p>}
      {takes.length > 0 && (
        <ol className="space-y-1.5">
          {takes.map((t, i) => (
            <li key={t.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${chosen === t.id ? "border-[#0e7da3] bg-[#0e7da3]/5" : "border-[#e2e8f0]"}`}>
              <span className="w-14 shrink-0 text-[12px] font-semibold text-[#1f2937]">Take {i + 1}</span>
              <audio src={t.url} controls preload="metadata" className="h-8 min-w-0 flex-1" />
              <span className="text-[11.5px] tabular-nums text-[#475569]">{t.seconds}s</span>
              {chosen === t.id ? (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0e7da3]"><Check size={13} /> Using this one</span>
              ) : (
                <button type="button" onClick={() => choose(t.id)} className="text-[12px] font-semibold text-[#0e7da3] underline-offset-2 hover:underline">Use this take</button>
              )}
              <button type="button" onClick={() => remove(t.id)} aria-label={`Delete take ${i + 1}`} className="rounded p-1 text-[#64748b] hover:text-[#be123c]"><Trash2 size={13} /></button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
