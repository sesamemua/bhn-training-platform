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

import { useState, useRef, useEffect } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Upload,
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
}

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
}: Props) {
  const [name, setName] = useState(lockedName);
  const [answer, setAnswer] = useState("");
  const answerWords = wordsIn(answer);
  const [linkedin, setLinkedin] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Returning-person lookup.
  const [matched, setMatched] = useState<Matched | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const lastQueried = useRef<string>("");

  // Local preview URL for a freshly chosen file — revoke on cleanup.
  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // Debounced exact-name lookup. Skips once the user has chosen their own
  // photo (we don't override their explicit upload). On a hit, prefill
  // LinkedIn (if blank) and show the saved photo.
  useEffect(() => {
    if (gated) return; // verified trainee — no name-based lookup needed
    // A form with a written question (e.g. Knowledge Exchange) starts blank every time:
    // nothing is filled in from someone's earlier entry.
    if (quote) return;
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
  }, [name, photoFile, gated, quote]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhotoFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(
        `Photo must be under 5 MB. Yours is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      );
      e.target.value = "";
      return;
    }
    setErrorMsg(null);
    setPhotoFile(file); // overrides any reused photo
  }

  // We're reusing the saved photo when there's a match and the user
  // hasn't uploaded a fresh file.
  const reusing = !!matched && !photoFile;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !linkedin.trim()) {
      setErrorMsg("Fill in your name and LinkedIn.");
      return;
    }
    if (!photoFile && !reusing) {
      setErrorMsg(photoLabel ? `Add a photo: ${photoLabel.toLowerCase()}.` : "Add a headshot.");
      return;
    }
    if (quote && answerWords === 0) {
      setErrorMsg("Please answer the written question.");
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
    if (photoFile) fd.set("photo", photoFile);
    else if (matched) fd.set("reuseFromId", matched.submissionId);

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
        <button
          type="button"
          onClick={() => {
            setName("");
            setLinkedin("");
            setAnswer("");
            setPhotoFile(null);
            setPhotoPreview(null);
            setMatched(null);
            lastQueried.current = "";
            setStatus("idle");
          }}
          className="mt-5 text-[12px] font-semibold underline"
          style={{ color: "#0b6f90" }}
        >
          Submit another
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";
  const firstName = (matched?.name ?? "").trim().split(/\s+/)[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.16em] font-bold text-[#1f2937] mb-1">
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
        <label className="block text-[11px] uppercase tracking-[0.16em] font-bold text-[#1f2937] mb-1">
          LinkedIn handle
        </label>
        <input
          type="text"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          required
          maxLength={200}
          disabled={submitting}
          className="w-full px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-[14px] text-[#111827] placeholder:text-[#5b6470] focus:outline-none focus:ring-2 focus:ring-[#0b6f90] disabled:opacity-50"
        />
        <p className="mt-1 text-[11px] text-[#475569]">
          Just the slug works — we&apos;ll fill in the rest.
        </p>
      </div>

      {/* Photo */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.16em] font-bold text-[#1f2937] mb-1">
          {photoLabel || "Headshot"}
        </label>
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div
            className="shrink-0 w-24 h-24 rounded-full overflow-hidden border-2 flex items-center justify-center"
            style={{
              borderColor: photoPreview ? "#67b094" : "#cbd5e1",
              backgroundColor: photoPreview ? "transparent" : "#f1f5f9",
            }}
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview}
                alt="Headshot preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <Camera className="h-7 w-7 text-[#64748b]" />
            )}
          </div>

          {/* Upload button + helper */}
          <div className="flex-1 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              disabled={submitting}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#cbd5e1] bg-white text-[12px] font-semibold text-[#1f2937] hover:bg-[#f1f5f9] disabled:opacity-50"
            >
              <Upload size={12} />
              {reusing
                ? "Upload a new photo"
                : photoFile
                  ? "Choose a different photo"
                  : "Choose photo"}
            </button>
            {reusing ? (
              <p className="mt-1 text-[11px] text-[#2a8a6a] font-medium">
                Using your saved headshot — upload a new one only if you want to
                replace it.
              </p>
            ) : photoFile ? (
              <p className="mt-1 text-[11px] text-[#475569] truncate">
                {photoFile.name} — {(photoFile.size / 1024).toFixed(0)} KB
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-[#475569] leading-relaxed">
              JPEG, PNG, or WebP. Under 5 MB. Square photos work best.
            </p>
          </div>
        </div>
      </div>

      {/* The group's written question, when it asks one. */}
      {quote && (
        <div>
          <label htmlFor="showcase-quote" className="block text-[11px] uppercase tracking-[0.16em] font-bold text-[#1f2937] mb-1">
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
            ? "Submitting…"
            : reusing
              ? "Confirm & submit"
              : "Submit my entry"}
        </button>
      </div>
    </form>
  );
}
