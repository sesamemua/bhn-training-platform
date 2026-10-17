"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { nameReviewKey, registrationName } from "@/lib/formbuilder/registration-name";
import type { Answers } from "@/lib/formbuilder/logic";
import type { FormField } from "@/lib/formbuilder/types";

export function RegistrationNameInput({ field, answers, set, className }: {
  field: FormField; answers: Answers; set: (key: string, value: Answers[string]) => void; className: string;
}) {
  const [blurred, setBlurred] = useState(false);
  const raw = String(answers[field.key] ?? "");
  const check = registrationName(raw, field.key);
  const reviewKey = nameReviewKey(field.key);
  const notesId = `name-check-${field.id}`;
  return (
    <>
      <input
        className={className} type="text" aria-label={field.label}
        autoComplete={field.key === "first_name" ? "given-name" : field.key === "last_name" ? "family-name" : "name"}
        autoCapitalize="words" spellCheck={false} maxLength={160}
        aria-describedby={notesId} aria-invalid={blurred && Boolean(check.error)}
        value={raw} onChange={e => set(field.key, e.target.value)}
        onBlur={() => { setBlurred(true); if (check.value !== raw) set(field.key, check.value); }}
      />
      <div id={notesId} className="mt-2 text-[12.5px] leading-relaxed text-muted">
        <p>Your personal name as you want it printed, including your family name if you use one. Keep your preferred spelling and capitalization.</p>
        {check.value && !check.error && <p className="mt-2">Name for your badge: <strong className="text-fg">{check.value}</strong></p>}
        {blurred && check.error && <p role="alert" className="mt-2 font-semibold text-red-600">{check.error}</p>}
        {blurred && !check.error && check.warnings.length > 0 && (
          <div className="mt-2 border-l-2 border-amber-500 pl-3">
            <ul className="list-disc space-y-1 pl-4">{check.warnings.map(w => <li key={w}>{w}</li>)}</ul>
            {check.suggestion && (
              <button type="button" className="mt-2 inline-flex items-center gap-1 font-semibold text-fg underline underline-offset-2" onClick={() => set(field.key, check.suggestion!)}>
                <Check size={14} aria-hidden="true" /> Use {check.suggestion}
              </button>
            )}
            <label className="mt-2 flex items-start gap-2 text-fg">
              <input type="checkbox" className="mt-1 accent-[var(--brand-500)]" checked={answers[reviewKey] === check.value} onChange={e => set(reviewKey, e.target.checked ? check.value : "")} />
              <span>This is my complete name, exactly as it should appear on my badge.</span>
            </label>
          </div>
        )}
      </div>
    </>
  );
}
