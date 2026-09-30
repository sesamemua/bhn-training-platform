"use client";

/**
 * Mock interview runner. One question at a time:
 *   • "Read aloud" speaks the question (Web Speech API, no infra).
 *   • Answer by VOICE — record with the mic, Whisper transcribes into an
 *     editable box — or just TYPE. Either way you can edit before submitting.
 *   • Submit scores the answer (0–100) with specific feedback.
 *   • Finish synthesizes an overall debrief.
 * Revisiting a completed session shows every answer + feedback read-only.
 * Voice is progressive enhancement: if the browser lacks mic / speech APIs,
 * the typed path works everywhere.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mic, Square, Volume2, Loader2, ChevronLeft, ChevronRight, Check,
  Flag, Trash2, Sparkles, RotateCcw, Gauge, Lightbulb, ChevronDown,
  AudioLines, Waves, HeartPulse, Activity, Info,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { analyzeAudio } from "@/lib/interview/acoustics";
import { AnalysisInfoModal } from "./AnalysisInfoModal";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface RunnerAnswer {
  id: string;
  order: number;
  question: string;
  questionKind: string;
  transcript: string;
  inputMode: string;
  score: number | null;
  feedback: string;
  strengths: string[];
  improvements: string[];
  confidence: number | null;
  wpm: number | null;
  fillerCount: number | null;
  stumbleCount: number | null;
  deliveryNote: string;
  guidance: Guidance | null;
  voice: VoiceRead | null;
  answered: boolean;
}
interface Guidance { intent: string; approach: string; wantToHear: string[]; avoid: string[]; modelOutline: string[] }
interface VoiceRead { tone: string; composure: string; stumbles: string; tip: string }
interface Delivery { durationSec: number; wordCount: number; wpm: number; fillerCount: number; fillerRate: number; longPauses: number; stumbleCount: number }
interface Acoustics { pitchHzMean: number; pitchVariation: number; energyVariation: number; voicedRatio: number; monotone: boolean }
interface InterviewInfo {
  id: string;
  role: string;
  status: string;
  overallScore: number | null;
  summary: string;
}

const KIND_LABEL: Record<string, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  situational: "Situational",
  motivation: "Motivation",
};

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted";
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-rose-600";
}
function scoreBg(score: number | null): string {
  if (score === null) return "bg-elevated text-subtle";
  if (score >= 75) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

/** Minimal MediaRecorder wrapper with capability detection. */
function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [supported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window !== "undefined" &&
      "MediaRecorder" in window,
  );
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    mr.start();
    mrRef.current = mr;
    setRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        const mr = mrRef.current;
        if (!mr) return resolve(new Blob());
        mr.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          setRecording(false);
          resolve(new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }));
        };
        mr.stop();
      }),
    [],
  );

  // Safety net: if the component unmounts mid-recording (navigation, tab
  // close), tear down the recorder + release the mic so it doesn't stay hot.
  useEffect(() => {
    return () => {
      try {
        if (mrRef.current && mrRef.current.state !== "inactive") mrRef.current.stop();
      } catch { /* already stopped */ }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { recording, supported, start, stop };
}

export function InterviewRunner({ interview, answers: initial }: { interview: InterviewInfo; answers: RunnerAnswer[] }) {
  const router = useRouter();
  const recorder = useRecorder();
  const [answers, setAnswers] = useState<RunnerAnswer[]>(initial);
  const firstUnanswered = Math.max(0, initial.findIndex((a) => !a.answered));
  const [idx, setIdx] = useState(interview.status === "complete" ? 0 : firstUnanswered === -1 ? 0 : firstUnanswered);
  const [draft, setDraft] = useState("");
  const [delivery, setDelivery] = useState<Delivery | null>(null); // from the recording, if any
  const [acoustics, setAcoustics] = useState<Acoustics | null>(null); // pitch/energy from the recording
  const [busy, setBusy] = useState<"transcribe" | "score" | "finish" | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [summary, setSummary] = useState({ status: interview.status, overallScore: interview.overallScore, text: interview.summary });

  const current = answers[idx];
  const answeredCount = answers.filter((a) => a.answered).length;
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Seed the draft from any saved transcript when moving between questions.
  useEffect(() => {
    setDraft(current?.transcript ?? "");
    setDelivery(null); // delivery only applies to a fresh recording on this visit
    setAcoustics(null);
    setError(null);
    setCoachOpen(false);
    stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Lazy-load per-question coaching ("how to answer" + what employers want).
  async function toggleCoaching() {
    if (!current) return;
    if (current.guidance) { setCoachOpen((o) => !o); return; }
    if (coachOpen) { setCoachOpen(false); return; }
    setCoachLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mock-interview/${interview.id}/guidance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId: current.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; guidance?: Guidance; error?: string };
      if (!res.ok || !j.ok || !j.guidance) { setError(j.error ?? "Couldn't load coaching — try again."); return; }
      const g = j.guidance;
      setAnswers((cur) => cur.map((a, i) => (i === idx ? { ...a, guidance: g } : a)));
      setCoachOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCoachLoading(false);
    }
  }

  // Recording timer.
  useEffect(() => {
    if (!recorder.recording) { setSeconds(0); return; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recorder.recording]);

  function stopSpeaking() {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }
  function readAloud() {
    if (!ttsSupported || !current) return;
    if (speaking) { stopSpeaking(); return; }
    const u = new SpeechSynthesisUtterance(current.question);
    u.rate = 1; u.onend = () => setSpeaking(false); u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  async function toggleRecord() {
    setError(null);
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (blob.size === 0) { setError("No audio captured — check mic permission."); return; }
      setBusy("transcribe");
      // Analyze pitch/energy locally (best-effort) in parallel with Whisper.
      const acousticsP = analyzeAudio(blob).catch(() => null);
      try {
        const res = await fetch(`/api/mock-interview/${interview.id}/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string; delivery?: Delivery | null };
        if (!res.ok || !j.ok) { setError(j.error ?? "Transcription failed — type your answer instead."); return; }
        setDraft((d) => (d.trim() ? `${d.trim()} ${j.text ?? ""}`.trim() : (j.text ?? "")));
        if (j.delivery) setDelivery(j.delivery);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
        const ac = await acousticsP;
        if (ac) setAcoustics(ac);
      }
    } else {
      try {
        await recorder.start();
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(
          name === "NotAllowedError"
            ? "Microphone blocked. Click the mic/lock icon in your browser's address bar, allow the microphone, and try again — or just type your answer."
            : name === "NotFoundError"
              ? "No microphone found. Plug one in, or type your answer."
              : name === "NotReadableError"
                ? "Your mic is in use by another app. Close it and try again, or type your answer."
                : "Couldn't access the mic. Allow microphone permission, or type your answer.",
        );
      }
    }
  }

  async function submitAnswer() {
    if (!current || !draft.trim()) { setError("Say or type an answer first."); return; }
    stopSpeaking();
    setBusy("score");
    setError(null);
    try {
      const res = await fetch(`/api/mock-interview/${interview.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerId: current.id,
          transcript: draft.trim(),
          inputMode: delivery || acoustics ? "voice" : "text",
          delivery: delivery ?? undefined,
          acoustics: acoustics ?? undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        evaluation?: { score: number; feedback: string; strengths: string[]; improvements: string[]; confidence: number | null; deliveryFeedback: string; voice: VoiceRead | null };
        delivery?: Delivery | null;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.evaluation) { setError(j.error ?? "Scoring failed — try again."); return; }
      const ev = j.evaluation;
      setAnswers((cur) => cur.map((a, i) => (i === idx ? {
        ...a, transcript: draft.trim(), answered: true,
        score: ev.score, feedback: ev.feedback, strengths: ev.strengths, improvements: ev.improvements,
        confidence: ev.confidence, deliveryNote: ev.deliveryFeedback, voice: ev.voice ?? null,
        wpm: j.delivery?.wpm ?? null, fillerCount: j.delivery?.fillerCount ?? null, stumbleCount: j.delivery?.stumbleCount ?? null,
      } : a)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    stopSpeaking();
    setBusy("finish");
    setError(null);
    try {
      const res = await fetch(`/api/mock-interview/${interview.id}/finish`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; overallScore?: number; summary?: string; error?: string };
      if (!res.ok || !j.ok) { setError(j.error ?? "Couldn't finish — try again."); return; }
      setSummary({ status: "complete", overallScore: j.overallScore ?? null, text: j.summary ?? "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteSession() {
    if (!(await confirmDialog({
      title: "Delete this practice session and its feedback?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    await fetch(`/api/mock-interview/${interview.id}`, { method: "DELETE" }).catch(() => {});
    router.push("/mock-interview");
  }

  const isComplete = summary.status === "complete";

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">Mock interview</p>
          <h1 className="truncate text-xl font-extrabold text-fg">{interview.role}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:bg-elevated hover:text-fg"
          >
            <Info size={13} /> How analysis works
          </button>
          <span className="text-[12px] text-muted tabular-nums">{answeredCount}/{answers.length} answered</span>
          <button type="button" onClick={deleteSession} title="Delete session" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-rose-700">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex flex-wrap gap-1.5">
        {answers.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setIdx(i)}
            title={`Question ${i + 1}${a.answered ? ` · ${a.score}/100` : ""}`}
            className={cn(
              "h-2.5 flex-1 min-w-[18px] rounded-full transition-colors",
              i === idx ? "ring-2 ring-brand-400 ring-offset-1" : "",
              a.answered ? (a.score !== null && a.score >= 75 ? "bg-emerald-400" : a.score !== null && a.score >= 50 ? "bg-amber-400" : "bg-rose-400") : "bg-line",
            )}
          />
        ))}
      </div>

      {/* Overall summary (after finishing) */}
      {isComplete && (
        <Card className="border-brand-200 bg-brand-50/50 p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-bold text-brand-800"><Flag size={15} /> Session debrief</p>
            {typeof summary.overallScore === "number" && (
              <span className="rounded-full bg-brand-600 px-3 py-1 text-sm font-extrabold text-white tabular-nums">{summary.overallScore}/100</span>
            )}
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg">{summary.text}</p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => router.push("/mock-interview")} className="rounded-md bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700">Back to practice</button>
            <button type="button" onClick={() => { setSummary((s) => ({ ...s, status: "in_progress" })); }} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card-solid px-3 py-2 text-xs font-semibold text-fg hover:bg-elevated">
              <RotateCcw size={12} /> Review answers
            </button>
          </div>
        </Card>
      )}

      {/* Question card */}
      {current && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
              {KIND_LABEL[current.questionKind] ?? "Question"} · {idx + 1} of {answers.length}
            </span>
            {ttsSupported && (
              <button type="button" onClick={readAloud} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold", speaking ? "bg-brand-100 text-brand-800" : "text-muted hover:bg-elevated hover:text-fg")}>
                <Volume2 size={13} /> {speaking ? "Stop" : "Read aloud"}
              </button>
            )}
          </div>

          <p className="mt-3 text-lg font-bold leading-snug text-fg">{current.question}</p>

          {/* Coaching — how to answer this + what employers want to hear */}
          <div className="mt-3">
            <button
              type="button"
              onClick={toggleCoaching}
              disabled={coachLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              {coachLoading ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />}
              How to answer this
              {current.guidance && <ChevronDown size={13} className={cn("transition-transform", coachOpen && "rotate-180")} />}
            </button>

            {coachOpen && current.guidance && (
              <div className="mt-2 space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                {current.guidance.intent && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-violet-700">What they&apos;re really asking</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-fg">{current.guidance.intent}</p>
                  </div>
                )}
                {current.guidance.approach && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-violet-700">How to approach it</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-fg">{current.guidance.approach}</p>
                  </div>
                )}
                {current.guidance.wantToHear.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">What employers want to hear</p>
                    <ul className="mt-1 space-y-1">
                      {current.guidance.wantToHear.map((s, i) => <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-fg"><Check size={13} className="mt-0.5 shrink-0 text-emerald-600" /> {s}</li>)}
                    </ul>
                  </div>
                )}
                {current.guidance.avoid.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700">Avoid</p>
                    <ul className="mt-1 space-y-1">
                      {current.guidance.avoid.map((s, i) => <li key={i} className="text-[12.5px] leading-snug text-muted">— {s}</li>)}
                    </ul>
                  </div>
                )}
                {current.guidance.modelOutline.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">A strong answer hits</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-4">
                      {current.guidance.modelOutline.map((s, i) => <li key={i} className="text-[12.5px] leading-snug text-fg">{s}</li>)}
                    </ol>
                  </div>
                )}
                <p className="border-t border-violet-200/60 pt-2 text-[11px] text-muted">
                  Try answering in your own words first, then compare — this is a scaffold, not a script.
                </p>
              </div>
            )}
          </div>

          {/* Answer area */}
          <div className="mt-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              placeholder={recorder.supported ? "Record your answer with the mic, or type it here…" : "Type your answer here…"}
              disabled={busy === "transcribe" || recorder.recording}
              className="w-full resize-y rounded-lg border border-line bg-card-solid px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-70"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {recorder.supported && (
                <button
                  type="button"
                  onClick={toggleRecord}
                  disabled={busy === "transcribe" || busy === "score"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-bold disabled:opacity-50",
                    recorder.recording ? "bg-rose-600 text-white hover:bg-rose-700" : "border border-line bg-card-solid text-fg hover:bg-elevated",
                  )}
                >
                  {busy === "transcribe" ? <Loader2 size={14} className="animate-spin" /> : recorder.recording ? <Square size={14} /> : <Mic size={14} />}
                  {busy === "transcribe" ? "Transcribing…" : recorder.recording ? `Stop · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Record answer"}
                </button>
              )}
              <button
                type="button"
                onClick={submitAnswer}
                disabled={busy !== null || recorder.recording || !draft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === "score" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {current.answered ? "Re-score answer" : "Submit answer"}
              </button>
              {draft && !recorder.recording && (
                <button type="button" onClick={() => { setDraft(""); setDelivery(null); setAcoustics(null); }} className="text-xs font-semibold text-muted hover:text-fg">Clear</button>
              )}
            </div>
            {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
          </div>

          {/* Feedback (after scoring) */}
          {current.answered && (
            <div className="mt-4 rounded-xl border border-line bg-elevated/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">Feedback</p>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums", scoreBg(current.score))}>{current.score}/100</span>
              </div>
              {current.feedback && <p className="mt-2 text-[13px] leading-relaxed text-fg">{current.feedback}</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {current.strengths.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">Strengths</p>
                    <ul className="mt-1 space-y-1">
                      {current.strengths.map((s, i) => <li key={i} className="text-[12.5px] leading-snug text-fg">• {s}</li>)}
                    </ul>
                  </div>
                )}
                {current.improvements.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700">Work on</p>
                    <ul className="mt-1 space-y-1">
                      {current.improvements.map((s, i) => <li key={i} className="text-[12.5px] leading-snug text-fg">• {s}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Delivery & confidence (from the voice answer) */}
              {(current.confidence !== null || current.wpm !== null || current.deliveryNote) && (
                <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-brand-700">
                      <Gauge size={12} /> Delivery &amp; confidence
                    </p>
                    {current.confidence !== null && (
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums", scoreBg(current.confidence))}>
                        {current.confidence}/100
                      </span>
                    )}
                  </div>
                  {(current.wpm !== null || current.fillerCount !== null) && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
                      {current.wpm !== null && <span><strong className="text-fg tabular-nums">{current.wpm}</strong> words/min</span>}
                      {current.fillerCount !== null && <span><strong className="text-fg tabular-nums">{current.fillerCount}</strong> filler word{current.fillerCount === 1 ? "" : "s"}</span>}
                    </div>
                  )}
                  {current.deliveryNote && <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg">{current.deliveryNote}</p>}
                  {current.wpm === null && current.confidence !== null && (
                    <p className="mt-1.5 text-[11px] text-subtle">Confidence read from your wording. Record a voice answer for pace &amp; filler-word analysis.</p>
                  )}
                </div>
              )}

              {/* Voice coach — tone, nerves, stumbles (spoken answers) */}
              {current.voice && (current.voice.tone || current.voice.composure || current.voice.stumbles || current.voice.tip) && (
                <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-indigo-700">
                      <AudioLines size={12} /> Voice coach
                    </p>
                    {current.stumbleCount !== null && (
                      <span className="text-[11px] text-muted"><strong className="text-fg tabular-nums">{current.stumbleCount}</strong> stumble{current.stumbleCount === 1 ? "" : "s"}</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {current.voice.tone && (
                      <p className="flex gap-2 text-[12.5px] leading-relaxed text-fg"><Waves size={13} className="mt-0.5 shrink-0 text-indigo-600" /><span><span className="font-semibold">Tone:</span> {current.voice.tone}</span></p>
                    )}
                    {current.voice.composure && (
                      <p className="flex gap-2 text-[12.5px] leading-relaxed text-fg"><HeartPulse size={13} className="mt-0.5 shrink-0 text-indigo-600" /><span><span className="font-semibold">Composure:</span> {current.voice.composure}</span></p>
                    )}
                    {current.voice.stumbles && (
                      <p className="flex gap-2 text-[12.5px] leading-relaxed text-fg"><Activity size={13} className="mt-0.5 shrink-0 text-indigo-600" /><span><span className="font-semibold">Fluency:</span> {current.voice.stumbles}</span></p>
                    )}
                  </div>
                  {current.voice.tip && (
                    <p className="mt-2 rounded-md bg-indigo-100/60 px-2.5 py-1.5 text-[12px] leading-relaxed text-indigo-900">
                      <span className="font-bold">Try this:</span> {current.voice.tip}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Nav + finish */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="inline-flex items-center gap-1 rounded-md border border-line bg-card-solid px-3 py-2 text-xs font-semibold text-fg hover:bg-elevated disabled:opacity-40">
          <ChevronLeft size={14} /> Previous
        </button>
        <span className={cn("text-xs font-semibold", scoreTone(current?.score ?? null))}>
          {current?.answered ? `Scored ${current.score}/100` : "Not answered yet"}
        </span>
        {idx < answers.length - 1 ? (
          <button type="button" onClick={() => setIdx((i) => Math.min(answers.length - 1, i + 1))} className="inline-flex items-center gap-1 rounded-md border border-line bg-card-solid px-3 py-2 text-xs font-semibold text-fg hover:bg-elevated">
            Next <ChevronRight size={14} />
          </button>
        ) : (
          <button type="button" onClick={finish} disabled={busy !== null || answeredCount === 0} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy === "finish" ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />} Finish &amp; get debrief
          </button>
        )}
      </div>

      {answeredCount > 0 && idx === answers.length - 1 && answeredCount < answers.length && !isComplete && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
          <Sparkles size={11} /> You can finish now for a debrief on what you&apos;ve answered, or go back and complete the rest.
        </p>
      )}

      {infoOpen && <AnalysisInfoModal onClose={() => setInfoOpen(false)} />}
      {confirmNode}
    </div>
  );
}
