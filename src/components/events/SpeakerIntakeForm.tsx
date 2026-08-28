"use client";

/**
 * The guest-facing form. Deliberately plain: the people filling it in are
 * senior invitees using it once, often on a phone, so every field is
 * visible at once with no wizard and no account.
 *
 * Two things earn their complexity here. The headshot is cropped in a
 * ring so nobody submits a photo with their head cut off. The bio has a
 * hard 250-WORD limit — counted in words, not characters — with an AI
 * shortener that proposes, never replaces: the speaker reads and
 * approves before anything goes in the field, and at this limit the
 * usual answer is "it already fits".
 */
import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { HeadshotCropper, type CropState } from "./HeadshotCropper";
import { BIO_MIN_WORDS, countWords } from "@/lib/events/bio";

export function SpeakerIntakeForm({
  slug,
  bioMaxWords,
}: {
  slug: string;
  /* Resolved on the server from the event, so the counter on screen and
     the rule the submit route enforces are the same number. A default
     baked into the client would silently disagree the moment an admin
     changed it. */
  bioMaxWords: number;
}) {
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
  const [shortenNote, setShortenNote] = useState<string | null>(null);

  const onCrop = useCallback((s: CropState) => setCrop(s), []);

  const bioWords = countWords(bio);
  const over = bioWords > bioMaxWords;
  const tooThin = bioWords < BIO_MIN_WORDS;

  async function shorten() {
    if (shortening) return;
    setShortening(true);
    setShortenError(null);
    setShortenNote(null);
    setSuggestion(null);
    try {
      const res = await fetch(`/api/events/${slug}/speaker-intake/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; bio?: string; error?: string; alreadyFits?: boolean; words?: number;
      };
      if (!res.ok || !j.ok || !j.bio) throw new Error(j.error ?? "Couldn't shorten it.");
      // Nothing to propose when it already fits — say so rather than
      // handing back the same words as though they were an improvement.
      // The button above will not normally let this happen; the server
      // is the authority on the count, so this handles it saying so.
      if (j.alreadyFits) {
        setShortenNote(`This already fits (${j.words ?? countWords(j.bio)} of ${bioMaxWords} words) — no need to shorten it.`);
      } else {
        setSuggestion(j.bio);
      }
    } catch (e) {
      setShortenError((e as Error).message);
    } finally {
      setShortening(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    /*
     * The form element, captured BEFORE anything is awaited.
     *
     * React clears currentTarget once the handler yields, so reading it
     * after `await crop.toBlob()` gave null — and `new FormData(null)`
     * throws "parameter 1 is not of type 'HTMLFormElement'", which
     * names the symptom and says nothing about the await that caused
     * it. Every answer on the form was lost to it.
     */
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const blob = await crop.toBlob();
      if (!blob) throw new Error("Please add a headshot.");
      const fd = new FormData(form);
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
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title / role" required>
          <input name="title" required maxLength={160} className={INPUT} />
        </Field>
        <Field label="Company" required>
          <input
            name="organization"
            required
            maxLength={160}
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className={INPUT}
          />
        </Field>
      </div>

      <Field label="Headshot" required group hint="Drag to frame it inside the circle.">
        <HeadshotCropper onChange={onCrop} />
      </Field>

      <Field
        label="Speaker biography"
        required
        // Same reason as the headshot: this field holds the textarea AND
        // the shorten-it button, and a label wrapping both forwards a
        // click on the button to the textarea.
        group
        labelFor="speaker-bio"
        hint={`Up to ${bioMaxWords} words.`}
      >
        <textarea
          id="speaker-bio"
          name="bio"
          required
          rows={12}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className={INPUT}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`text-[11.5px] font-medium ${over ? "text-rose-600" : "text-slate-500"}`}>
            {bioWords} / {bioMaxWords} words
          </span>
          <button
            type="button"
            onClick={shorten}
            /*
             * Only offered when the bio actually runs over.
             *
             * At 250 characters every bio was several times the limit and
             * this button always did real work. At 250 words most bios
             * already fit, so leaving it enabled buys a network round trip
             * and a spinner to be told nothing needed doing.
             */
            disabled={shortening || tooThin || !over}
            title={
              tooThin
                ? "Write a little more first"
                : !over
                  ? `Only needed above ${bioMaxWords} words — you are inside the limit`
                  : `Suggest a version inside ${bioMaxWords} words`
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-40"
          >
            {shortening ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Shorten for me
          </button>
          {over && (
            <span className="text-[11.5px] text-rose-600">
              {bioWords - bioMaxWords} words over — shorten it before submitting.
            </span>
          )}
        </div>

        {shortenError && <p className="mt-1.5 text-[12px] text-rose-600">{shortenError}</p>}
        {shortenNote && <p className="mt-1.5 text-[12px] text-slate-600">{shortenNote}</p>}

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
              rows={10}
              className="mt-1.5 w-full rounded-md border border-brand-200 bg-white px-2.5 py-2 text-[13px] leading-relaxed text-slate-900 outline-none focus:border-brand-500"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11.5px] text-slate-500">{countWords(suggestion)} / {bioMaxWords} words</span>
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

/**
 * One labelled question.
 *
 * `group` is not cosmetic. A <label> activates its FIRST labelable
 * descendant on any click inside it — which is right when it wraps one
 * input, and wrong when it wraps several. The headshot field holds a
 * file input, a canvas you drag to frame the photo, and a zoom slider:
 * wrapped in one label, dragging the photo ended in a click that the
 * label forwarded to the file input, and the picker opened every time
 * somebody tried to move their own face.
 *
 * A group renders a <div> and its caption as text. Nothing is lost —
 * the controls inside carry their own labels — and the HTML stops
 * claiming that one label describes three controls.
 */
function Field({
  label,
  hint,
  required,
  group,
  labelFor,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** The children are more than one control. See above. */
  group?: boolean;
  /**
   * In a group, the id of the ONE control the caption names.
   *
   * A <label for> points at a single control, so clicking the caption
   * still focuses it while a click on a sibling button does nothing to
   * it — which is the behaviour a wrapping label was approximating and
   * getting wrong. Without this a grouped field's control has no
   * accessible name at all, which is a worse bug than the one being
   * fixed.
   */
  labelFor?: string;
  children: React.ReactNode;
}) {
  const Wrapper = group ? "div" : "label";
  const Caption = group ? (labelFor ? "label" : "div") : "span";
  return (
    <Wrapper className="block">
      <Caption
        {...(group && labelFor ? { htmlFor: labelFor } : {})}
        className="text-[12.5px] font-semibold text-slate-800"
      >
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
        {hint && <span className="ml-2 font-normal text-[11.5px] text-slate-500">{hint}</span>}
      </Caption>
      <div className="mt-1.5">{children}</div>
    </Wrapper>
  );
}
