"use client";

/**
 * The awardee-facing form. Plain on purpose, like the speaker form it
 * borrows its fields from: filled in once, often on a phone.
 *
 * The photo can be a headshot or a picture in the lab, so it is not
 * cropped to a circle the way a speaker's is. It is shrunk in the browser
 * before sending — a phone photo is often bigger than one request can
 * carry — and redrawing it also drops the camera's location data from a
 * picture that is going to be published.
 */
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Field, INPUT } from "@/components/events/SpeakerIntakeForm";
import { countWords } from "@/lib/events/bio";
import { TEXT_FIELDS } from "@/lib/knowledge-exchange/intake";

/** Long edge of the photo sent: plenty for the website and social posts. */
const LONG_EDGE = 2400;

async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("That photo couldn't be opened. Please use a JPEG, PNG or WebP image.");
    });
    const k = Math.min(1, LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare the photo. Please try another browser.");
    // White under the picture, or a transparent PNG turns black as a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("That photo couldn't be prepared. Please try another one.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function KeAwardeeForm({ quoteMaxWords }: { quoteMaxWords: number }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const words = countWords(quote);
  const over = words > quoteMaxWords;

  function pick(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    // Captured before anything is awaited: React clears currentTarget once the handler yields.
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      if (!photo) throw new Error("Please add a photo.");
      const fd = new FormData(form);
      fd.set("photo", new File([await shrink(photo)], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/knowledge-exchange/awardee", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[var(--speaker-success-line)] bg-[var(--speaker-success-bg)] px-5 py-6 text-center">
        <CheckCircle2 className="mx-auto text-[var(--speaker-success)]" size={26} />
        <p className="mt-2 text-[15px] font-semibold text-[var(--speaker-success-strong)]">Thank you — we have everything.</p>
        <p className="mt-1 text-[13px] text-[var(--speaker-success-copy)]">
          The BioHubNet team will be in touch if anything needs checking.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {TEXT_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} required>
          {"rows" in f ? (
            // No maxLength: it would cut a pasted answer off without a word.
            // The endpoint refuses anything too long, and says so.
            <textarea name={f.key} required rows={f.rows} className={INPUT} />
          ) : (
            <input name={f.key} required maxLength={f.max} className={INPUT} />
          )}
        </Field>
      ))}

      <Field label="Photo" hint="A headshot, or a photo of you working in a lab." required group labelFor="ke-photo">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview
          <img
            src={preview}
            alt="Your photo"
            className="mb-2 max-h-64 max-w-full rounded-lg border border-[var(--speaker-control-line)] object-contain"
          />
        )}
        {/* No name: the shrunk copy is what gets sent, not this original. */}
        <input
          id="ke-photo"
          type="file"
          accept="image/*"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="block w-full text-[13px] text-[var(--speaker-copy)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand-600)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-white"
        />
      </Field>

      <Field
        label="What do you hope to achieve from this placement?"
        hint={`Or what motivates you to take part. Up to ${quoteMaxWords} words — we'll use it as a quote.`}
        required
        group
        labelFor="ke-quote"
      >
        <textarea
          id="ke-quote"
          name="quote"
          required
          rows={4}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          className={INPUT}
        />
        <span
          className={`mt-1 block text-[11.5px] font-medium ${
            over ? "text-[var(--speaker-danger)]" : "text-[var(--speaker-subtle)]"
          }`}
        >
          {words} / {quoteMaxWords} words
          {over && ` — ${words - quoteMaxWords} over`}
        </span>
      </Field>

      <Field label="LinkedIn profile" hint="Optional.">
        <input name="linkedin" maxLength={200} placeholder="linkedin.com/in/yourname" className={INPUT} />
      </Field>

      {error && (
        <p className="rounded-lg border border-[var(--speaker-danger-line)] bg-[var(--speaker-danger-bg)] px-3 py-2 text-[13px] text-[var(--speaker-danger-strong)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || over || !photo}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand-600)] px-5 py-3 text-[15px] font-bold text-white transition hover:bg-[var(--brand-700)] disabled:cursor-not-allowed disabled:bg-[var(--speaker-primary-disabled)] disabled:text-white"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        Send my details
      </button>
    </form>
  );
}
