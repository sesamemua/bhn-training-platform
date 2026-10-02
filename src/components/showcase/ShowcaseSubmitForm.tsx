"use client";

/**
 * ShowcaseSubmitForm — public form on /showcase/<programSlug>.
 *
 * Returning-person flow: as the user types their NAME, a debounced
 * exact-name lookup (/api/showcase/lookup) checks whether they've
 * submitted before (any cohort). On a match it prefills their LinkedIn
 * and shows their saved photo for confirm-or-update — they don't
 * re-upload. Submitting then reuses the saved photo (via reuseFromId)
 * and records them in THIS cohort; uploading a new photo always wins.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { HeadshotCropper, type CropState } from "@/components/events/HeadshotCropper";
import { TestimonialAnswers, answered, type TestimonialValue } from "./TestimonialAnswers";
import { MAX_TEXT_WORDS } from "@/lib/showcase/testimonial";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

interface Props {
  programSlug: string;
  /** Gated cohort: the visitor is a verified, signed-in, attended trainee.
   *  Skips the returning-person name lookup and prefills their name. */
  gated?: boolean;
  lockedName?: string;
  /** The group's written question, if it asks one — answered in a box with a word limit. */
  quote?: { prompt: string; maxWords: number } | null;
  /** What the photo question is called; "Headshot" by default. */
  photoLabel?: string | null;
  /** A required consent checkbox before Submit, with this text. */
  consentText?: string | null;
  /** Testimonial links: guide questions answered by typing or recording. */
  questions?: string[] | null;
  /** Testimonial links: "Which programme are you part of?" */
  programChoices?: string[];
}

const CROPPER_COLOURS = {
  "--speaker-control-line": "#cbd5e1", "--speaker-control-bg": "#f8fafc", "--speaker-control-ink": "#111827",
  "--speaker-disabled-bg": "#e2e8f0", "--speaker-subtle": "#475569", "--speaker-copy": "#1f2937",
  "--speaker-danger-line": "#fecdd3", "--speaker-danger-bg": "#fff1f2", "--speaker-danger-strong": "#be123c", "--speaker-danger": "#e11d48",
} as React.CSSProperties;

const wordsIn = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

type Status = "idle" | "submitting" | "success" | "error";
type Matched = {
  submissionId: string;
  name: string;
  linkedinHandle: string | null;
  photoUrl: string;
};

export function ShowcaseSubmitForm({
  programSlug,
  gated = false,
  lockedName = "",
  quote = null,
  photoLabel = null,
  consentText = null,
  questions = null,
  programChoices = [],
}: Props) {
  const [consent, setConsent] = useState(false);
  const [story, setStory] = useState<TestimonialValue>({ programs: [], drafts: {} });
  const [uploading, setUploading] = useState<string | null>(null);
  // Intake forms (a written question, or testimonial questions) use sentence-case labels; the graduate showcase keeps its small caps.
  const LABEL = quote || questions
    ? "block text-[13.5px] font-semibold text-[#1f2937] mb-1"
    : "block text-[11px] uppercase tracking-[0.16em] font-bold text-[#1f2937] mb-1";
  const [name, setName] = useState(lockedName);
  const [answer, setAnswer] = useState("");
  const answerWords = wordsIn(answer);
  const [linkedin, setLinkedin] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // The photo as framed in the cropper: dragged, zoomed, auto-centred.
  const [crop, setCrop] = useState<CropState>({ file: null, toBlob: async () => null });
  const onCrop = useCallback((c: CropState) => { setCrop(c); setPhotoFile(c.file); }, []);

  // Returning-person lookup.
  const [matched, setMatched] = useState<Matched | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const lastQueried = useRef<string>("");


  // Debounced exact-name lookup. Skips once the user has chosen their own
  // photo (we don't override their explicit upload). On a hit, prefill
  // LinkedIn (if blank) and show the saved photo.
  useEffect(() => {
    if (gated) return; // verified trainee — no name-based lookup needed
    // A form with a written question (e.g. Knowledge Exchange) starts blank every time:
    // nothing is filled in from someone's earlier entry.
    if (quote || questions) return;
    if (photoFile) return;
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      if (matched) {
        setMatched(null);
        setPhotoPreview(null);
        lastQueried.current = "";
      }
      return;
    }
    const handle = setTimeout(async () => {
      if (trimmed.toLowerCase() === lastQueried.current) return;
      lastQueried.current = trimmed.toLowerCase();
      setLookupBusy(true);
      try {
        const res = await fetch(
          `/api/showcase/lookup?name=${encodeURIComponent(trimmed)}`,
        );
        const j = (await res.json().catch(() => ({}))) as {
          found?: boolean;
          submissionId?: string;
          name?: string;
          linkedinHandle?: string | null;
          photoUrl?: string;
        };
        if (j.found && j.photoUrl && j.submissionId && j.name) {
          setMatched({
            submissionId: j.submissionId,
            name: j.name,
            linkedinHandle: j.linkedinHandle ?? null,
            photoUrl: j.photoUrl,
          });
          if (j.linkedinHandle && !linkedin.trim()) setLinkedin(j.linkedinHandle);
          setPhotoPreview(j.photoUrl);
        } else {
          setMatched(null);
          setPhotoPreview(null);
        }
      } catch {
        /* ignore lookup errors — fall back to manual entry */
      } finally {
        setLookupBusy(false);
      }
    }, 550);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, photoFile, gated, quote, questions]);



  // We're reusing the saved photo when there's a match and the user
  // hasn't uploaded a fresh file.
  const reusing = !!matched && !photoFile;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || (!questions && !linkedin.trim())) {
      setErrorMsg(questions ? "Fill in your name." : "Fill in your name and LinkedIn.");
      return;
    }
    if (questions) {
      const ready = answered(story);
      if (programChoices.length && !story.programs.length) { setErrorMsg("Tell us which programme you are part of."); return; }
      if (!ready.length) { setErrorMsg("Answer at least one of the questions — type it or record it."); return; }
      const long = ready.find(([, d]) => d.mode === "type" && wordsIn(d.text) > MAX_TEXT_WORDS);
      if (long) { setErrorMsg(`Keep each typed answer to ${MAX_TEXT_WORDS} words — “${long[0]}” is longer.`); return; }
    }
    if (!photoFile && !reusing) {
      setErrorMsg(photoLabel ? `Add a photo: ${photoLabel.toLowerCase()}.` : "Add a headshot.");
      return;
    }
    if (quote && answerWords === 0) {
      setErrorMsg("Please answer the written question.");
      return;
    }
    if (consentText && !consent) {
      setErrorMsg("Please tick the box to give your consent.");
      return;
    }
    if (quote && answerWords > quote.maxWords) {
      setErrorMsg(`Keep your answer to ${quote.maxWords} words or fewer — it's ${answerWords} now.`);
      return;
    }

    const fd = new FormData();
    fd.set("programSlug", programSlug);
    fd.set("name", name.trim());
    fd.set("linkedin", linkedin.trim());
    if (quote) fd.set("quote", answer.trim());
    if (consentText && consent) fd.set("consent", "yes");
    if (questions) {
      // The chosen takes go up first, one at a time; each comes back with its words.
      const out: { question: string; text?: string; audioKey?: string; transcript?: string }[] = [];
      const ready = answered(story);
      const recordings = ready.filter(([, d]) => d.mode === "record").length;
      let n = 0;
      setStatus("submitting");
      for (const [question, d] of ready) {
        if (d.mode === "type") { out.push({ question, text: d.text.trim() }); continue; }
        n += 1;
        setUploading(`Uploading your recordings… ${n} of ${recordings}`);
        const af = new FormData();
        af.set("programSlug", programSlug);
        const ext = d.take!.blob.type.includes("mp4") ? "m4a" : d.take!.blob.type.includes("ogg") ? "ogg" : "webm";
        af.set("audio", new File([d.take!.blob], `answer.${ext}`, { type: d.take!.blob.type.split(";")[0] || "audio/webm" }));
        const r = await fetch("/api/showcase/audio", { method: "POST", body: af }).catch(() => null);
        const j = (await r?.json().catch(() => ({}))) as { ok?: boolean; key?: string; transcript?: string; error?: string };
        if (!r?.ok || !j.ok || !j.key) {
          setUploading(null);
          setStatus("error");
          setErrorMsg(j.error ?? "A recording didn't upload — try again.");
          return;
        }
        out.push({ question, audioKey: j.key, transcript: j.transcript ?? "" });
      }
      setUploading(null);
      fd.set("answers", JSON.stringify(out));
      fd.set("programs", story.programs.join(","));
    }
    if (photoFile) {
      const blob = await crop.toBlob();
      if (!blob) {
        setErrorMsg("Couldn't read that photo — try choosing it again.");
        return;
      }
      fd.set("photo", new File([blob], "photo.png", { type: "image/png" }));
    } else if (matched) fd.set("reuseFromId", matched.submissionId);

    setStatus("submitting");
    try {
      const res = await fetch("/api/showcase/submit", {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setStatus("error");
        setErrorMsg(j.error ?? `Submission failed (HTTP ${res.status}).`);
        return;
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error — try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <CheckCircle2 className="h-12 w-12 mb-3" style={{ color: "#67b094" }} />
        <h3 className="text-[18px] font-semibold text-[#111827]">
          Submitted — thank you.
        </h3>
        <p className="mt-2 text-[13px] text-[#475569] max-w-sm">
          We&apos;ll review your entry and you&apos;ll see yourself on the
          showcase shortly. If anything looks off, the team will reach out.
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";
  const firstName = (matched?.name ?? "").trim().split(/\s+/)[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className={LABEL}>
          Your name
        </label>
        <div className="relative">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoComplete="name"
            disabled={submitting}
            className="w-full px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-[14px] text-[#111827] placeholder:text-[#5b6470] focus:outline-none focus:ring-2 focus:ring-[#0b6f90] disabled:opacity-50"
          />
          {lookupBusy && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#94a3b8]"
            />
          )}
        </div>
      </div>

      {/* Returning-person banner */}
      {reusing && (
        <div className="flex items-start gap-2 rounded-lg bg-[#eef7f4] ring-1 ring-inset ring-[#bfe3d6] px-3 py-2.5 text-[12.5px] text-[#14532d]">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#2a8a6a" }} />
          <span>
            Welcome back{firstName ? `, ${firstName}` : ""}! We found your earlier
            entry — your LinkedIn and headshot are filled in below. Update
            anything that&apos;s changed, or just confirm.
          </span>
        </div>
      )}

      {/* Verified-trainee banner (attendance-gated cohort) */}
      {gated && (
        <div className="flex items-start gap-2 rounded-lg bg-[#eef7f4] ring-1 ring-inset ring-[#bfe3d6] px-3 py-2.5 text-[12.5px] text-[#14532d]">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#2a8a6a" }} />
          <span>
            You&apos;re verified as an attended trainee for this cohort — just
            add your LinkedIn and a headshot to be featured.
          </span>
        </div>
      )}

      {/* LinkedIn */}
      <div>
        <label className={LABEL}>
          {/* Awardee forms (with a written question) ask for the link, in the programme's own words. */}
          {questions ? "LinkedIn Account (optional)" : quote ? "LinkedIn Account" : "LinkedIn handle"}
        </label>
        <input
          type="text"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          required={!questions}
          maxLength={200}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-[14px] text-[#111827] placeholder:text-[#5b6470] focus:outline-none focus:ring-2 focus:ring-[#0b6f90] disabled:opacity-50"
        />
        {!quote && !questions && (
          <p className="mt-1 text-[11px] text-[#475569]">
            Just the slug works — we&apos;ll fill in the rest.
          </p>
        )}
      </div>

      {/* Photo */}
      <div>
        <label className={LABEL}>
          {photoLabel || "Headshot"}
        </label>
        {reusing && photoPreview && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Your saved headshot" className="h-16 w-16 rounded-full border-2 border-[#67b094] object-cover" />
            <p className="text-[11px] font-medium text-[#2a8a6a]">
              Using your saved headshot — choose a new photo below only if you want to replace it.
            </p>
          </div>
        )}
        {/* The cropper is styled by the speaker page's colour variables; set here for this page. */}
        <div style={CROPPER_COLOURS}>
          <HeadshotCropper onChange={onCrop} />
        </div>
      </div>

      {/* Testimonial links: programme, then the guide questions. */}
      {questions && (
        <TestimonialAnswers questions={questions} programChoices={programChoices} value={story} onChange={setStory} disabled={submitting} labelClass={LABEL} />
      )}

      {/* The group's written question, when it asks one. */}
      {quote && (
        <div>
          <label htmlFor="showcase-quote" className={LABEL}>
            Your words
          </label>
          <p className="mb-1.5 text-[13px] leading-relaxed text-[#1f2937]">{quote.prompt}</p>
          <textarea
            id="showcase-quote"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            required
            rows={7}
            disabled={submitting}
            className="w-full px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-[14px] leading-relaxed text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#0b6f90] disabled:opacity-50"
          />
          <p className={`mt-1 text-[11px] ${answerWords > quote.maxWords ? "font-semibold text-[#881337]" : "text-[#475569]"}`} aria-live="polite">
            {answerWords} of {quote.maxWords} words
          </p>
        </div>
      )}

      {/* Error — see note in the original on the literal rose colour. */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 text-[12px] text-[#881337]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* The link's consent, when it asks for it: ticked before anything is sent. */}
      {consentText && (
        <label htmlFor="showcase-consent" className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#1f2937]">
          <input
            id="showcase-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            disabled={submitting}
            className="mt-1 h-4 w-4 shrink-0 accent-[#0e7da3]"
          />
          <em>{consentText}</em>
        </label>
      )}

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-[14px] font-semibold disabled:opacity-50"
          style={{
            background: "linear-gradient(90deg, #2a6d7a 0%, #0e7da3 100%)",
          }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitting
            ? (uploading ?? "Submitting…")
            : reusing
              ? "Confirm & submit"
              : "Submit my entry"}
        </button>
      </div>
    </form>
  );
}
