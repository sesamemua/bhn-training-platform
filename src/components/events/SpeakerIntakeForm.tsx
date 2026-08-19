"use client";

/**
 * The guest-facing form. Deliberately plain: the people filling it in are
 * senior invitees using it once, often on a phone, so every field is
 * visible at once with no wizard and no account.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";

export function SpeakerIntakeForm({ slug }: { slug: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      if (photo) fd.set("photo", photo);
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
        <input name="name" required maxLength={120} className={INPUT} placeholder="Dr Priya Iyer" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title / role">
          <input name="title" maxLength={160} className={INPUT} placeholder="VP, Process Development" />
        </Field>
        <Field label="Company / institution">
          <input name="organization" maxLength={160} className={INPUT} placeholder="Sanofi Canada" />
        </Field>
      </div>

      <Field label="Headshot" required hint="JPEG, PNG or WebP, under 5 MB.">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 transition hover:border-brand-400">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Upload size={16} />
            </span>
          )}
          <span className="text-[13px] text-slate-600">
            {photo ? photo.name : "Choose a photo…"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
      </Field>

      <Field label="Short bio" required hint="A paragraph is plenty — this is printed as written.">
        <textarea name="bio" required rows={6} minLength={20} maxLength={2500} className={INPUT} />
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
        disabled={busy}
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
