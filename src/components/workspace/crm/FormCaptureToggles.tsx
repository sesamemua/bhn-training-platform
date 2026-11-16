"use client";

import { useState } from "react";
import { crmPost } from "./crm-api";
import { cn } from "@/lib/utils";

export function FormCaptureToggles({ forms, initial }: { forms: { slug: string; title: string }[]; initial: string[] }) {
  const [on, setOn] = useState(new Set(initial));
  const [error, setError] = useState<string | null>(null);

  async function toggle(slug: string) {
    const next = !on.has(slug);
    setOn((cur) => { const s = new Set(cur); if (next) s.add(slug); else s.delete(slug); return s; });
    const { ok, data } = await crmPost("forms.capture", { slug, on: next });
    if (!ok) {
      setError(data.error ?? "Couldn't save that.");
      setOn((cur) => { const s = new Set(cur); if (next) s.delete(slug); else s.add(slug); return s; });
    }
  }

  if (forms.length === 0) return <p className="mt-3 text-xs text-muted">No forms yet.</p>;
  return (
    <>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      <ul className="mt-3 flex flex-wrap gap-2">
        {forms.map((f) => (
          <li key={f.slug}>
            <button
              type="button"
              aria-pressed={on.has(f.slug)}
              onClick={() => toggle(f.slug)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors",
                on.has(f.slug) ? "border-brand-300 bg-brand-50 text-brand-800" : "border-line bg-card-solid text-muted hover:text-fg",
              )}
            >
              {on.has(f.slug) ? "✓ " : ""}{f.title}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
