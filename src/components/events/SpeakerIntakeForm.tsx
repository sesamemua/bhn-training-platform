"use client";

/**
 * The guest-facing form. Deliberately plain: the people filling it in are
 * senior invitees using it once, often on a phone, so every field is
 * visible at once with no wizard and no account.
 *
 * Three things earn their complexity here. The headshot is cropped in a
 * ring so nobody submits a photo with their head cut off. The bio has a
 * hard 250-character limit with an AI shortener that proposes, never
 * replaces — the speaker reads and approves before it goes in the field.
 * LinkedIn is a lookup, not a guess: we cannot read LinkedIn profiles, so
 * the button opens a search for their own name and they paste the result.
 */
import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, Search, Sparkles, X } from "lucide-react";
import { HeadshotCropper, type CropState } from "./HeadshotCropper";

const BIO_LIMIT = 250;

export function SpeakerIntakeForm({ slug }: { slug: string }) {
  const [crop, setCrop] = useState<CropState>({ file: null, toBlob: async () => null });
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // AI suggestion lives beside the field, never in it, until approved.
  const [shortening, setShortening] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [shortenError, setShortenError] = useState<string | null>(null);

  const onCrop = useCallback((s: CropState) => setCrop(s), []);
  const over = bio.length > BIO_LIMIT;

  async function shorten() {
    if (shortening) return;
    setShortening(true);
    setShortenError(null);
    setSuggestion(null);
    try {
      const res = await fetch(`/api/events/${slug}/speaker-intake/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; bio?: string; error?: string };
      if (!res.ok || !j.ok || !j.bio) throw new Error(j.error ?? "Couldn't shorten it.");
      setSuggestion(j.bio);
    } catch (e) {
      setShortenError((e as Error).message);
    } finally {
      setShortening(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await crop.toBlob();
      if (!blob) throw new Error("Please add a headshot.");
      const fd = new FormData(e.currentTarget);
      // The cropped square, not the original — what they framed is what
      // is stored, so the circle on the website always fits.
      fd.set("photo", new File([blob], "headshot.png", { type: "image/png" }));
      const res = await fetch(`/api/events/${slug}/speaker-intake`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Something went wrong.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-6 text-center">
        <CheckCircle2 className="mx-auto text-emerald-600" size={26} />
        <p className="mt-2 text-[15px] font-semibold text-emerald-900">Thank you — we have everything.</p>
        <p className="mt-1 text-[13px] text-emerald-800">
          Your details go to the organisers for the event website. They’ll be in
          touch if anything needs checking.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full name" required>
        <input
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={INPUT}
          placeholder="Dr Priya Iyer"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title / role">
          <input name="title" maxLength={160} className={INPUT} placeholder="VP, Process Development" />
        </Field>
        <Field label="Company / institution">
          <input
            name="organization"
            maxLength={160}
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className={INPUT}
            placeholder="Sanofi Canada"
          />
        </Field>
      </div>

      <Field label="Headshot" required hint="Drag to frame it inside the circle.">
        <HeadshotCropper onChange={onCrop} />
      </Field>

      <Field
        label="Speaker biography"
        required
        hint={`${BIO_LIMIT} characters max — this prints beside your photo.`}
      >
        <textarea
          name="bio"
          required
          rows={5}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className={INPUT}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`text-[11.5px] font-medium ${over ? "text-rose-600" : "text-slate-500"}`}>
            {bio.length} / {BIO_LIMIT}
          </span>
          <button
            type="button"
            onClick={shorten}
            disabled={shortening || bio.trim().length < 30}
            title={bio.trim().length < 30 ? "Write a little more first" : "Suggest a shorter version"}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
          >
            {shortening ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Shorten for me
          </button>
          {over && (
            <span className="text-[11.5px] text-rose-600">
              Too long — shorten it before submitting.
            </span>
          )}
        </div>

        {shortenError && <p className="mt-1.5 text-[12px] text-rose-600">{shortenError}</p>}

        {suggestion && (
          <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-brand-800">
              <Sparkles size={11} /> Suggested — edit it, then use it
              <button
                type="button"
                onClick={() => setSuggestion(null)}
                className="ml-auto text-brand-700 hover:text-brand-900"
                aria-label="Dismiss suggestion"
              >
                <X size={12} />
              </button>
            </p>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-md border border-brand-200 bg-white px-2.5 py-2 text-[13px] text-slate-900 outline-none focus:border-brand-500"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11.5px] text-slate-500">{suggestion.length} / {BIO_LIMIT}</span>
              <button
                type="button"
                onClick={() => { setBio(suggestion); setSuggestion(null); }}
                className="ml-auto rounded-md bg-brand-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-brand-700"
              >
                Use this
              </button>
            </div>
          </div>
        )}
      </Field>

      <Field label="LinkedIn profile" hint="Paste the URL, or just your handle.">
        <div className="flex gap-2">
          <input name="linkedin" maxLength={200} className={INPUT} placeholder="linkedin.com/in/yourname" />
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([name, organization].filter(Boolean).join(" "))}`}
            target="_blank"
            rel="noreferrer"
            title={name ? `Search LinkedIn for ${name}` : "Enter your name first"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[12.5px] font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700"
          >
            <Search size={13} /> Find mine
          </a>
        </div>
      </Field>

      <Field
        label="What will your session offer?"
        hint="A brief description of the advice or insights you plan to share — or who would benefit most from attending."
      >
        <textarea name="sessionPitch" rows={4} maxLength={600} className={INPUT} />
      </Field>

      <Field label="Topics you can speak to" hint="Separate with commas.">
        <input name="topics" className={INPUT} placeholder="Cell therapy manufacturing, Regulatory strategy, Scale-up" />
      </Field>

      <Field label="Your email" hint="Only used if we need to check something. Not published.">
        <input name="email" type="email" className={INPUT} placeholder="you@example.com" />
      </Field>

      {error && (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy || over || !crop.file}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-[15px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        Send my details
      </button>
    </form>
  );
}

const INPUT =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900 outline-none transition focus:border-brand-500";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-slate-800">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      {hint && <span className="ml-2 text-[11.5px] text-slate-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
