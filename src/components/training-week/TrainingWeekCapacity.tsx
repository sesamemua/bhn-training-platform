"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { CapacityMonitor } from "./CapacityMonitor";
import { WorkshopRegistrationControl, type SaveWorkshopRegistration } from "./WorkshopRegistrationControl";

export type SaveWorkshopCapacity = (id: string, patch: { capacity: number }) => Promise<{ ok: boolean; problem?: string }>;

export function TrainingWeekCapacity({ sessions, registered, action, saveCapacity, saveWorkshopState }: Omit<ComponentProps<typeof CapacityMonitor>, "controls"> & {
  saveCapacity: SaveWorkshopCapacity;
  saveWorkshopState: SaveWorkshopRegistration;
}) {
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return <>
    <CapacityMonitor sessions={sessions} registered={registered} action={action} controls={(s) => (
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <NumberField key={`${s.id}:${s.cap.capacity}`} label="Seats" ariaLabel={`Seat capacity for ${s.title}`} value={s.cap.capacity} disabled={busy}
          onCommit={(capacity, revert) => start(async () => {
            setProblem(null);
            try {
              const result = await saveCapacity(s.id, { capacity });
              if (!result.ok) { revert(); setProblem(`${s.title}: ${result.problem ?? "Could not save."}`); }
            } catch { revert(); setProblem(`${s.title}: Could not save. Please try again.`); }
          })}
        />
        {s.registration && <WorkshopRegistrationControl key={`${s.id}:${s.registration.state}`} slug={s.slug} title={s.title} initial={s.registration.state} save={saveWorkshopState} />}
      </div>
    )} />
    {busy && <p role="status" className="mt-2 text-[12px] text-muted">Saving capacity...</p>}
    {problem && <p role="alert" className="mt-2 text-[12px] text-fg">{problem}</p>}
  </>;
}

/** Shared with the Capacity tab: save on blur, revert a refused write. */
export function NumberField({ label, ariaLabel, value, disabled, onCommit }: {
  label: string; ariaLabel?: string; value: number; disabled?: boolean;
  onCommit: (v: number, revert: () => void) => void;
}) {
  const [v, setV] = useState(String(value));
  return <label className="block">
    <span className="text-[10.5px] uppercase tracking-wide text-subtle">{label}</span>
    <input type="number" min={0} max={1000} step={1} value={v} disabled={disabled} aria-label={ariaLabel}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (v.trim() && Number.isInteger(n) && n >= 0 && n <= 1000 && n !== value) onCommit(n, () => setV(String(value)));
        else setV(String(value));
      }}
      className="mt-0.5 w-20 rounded-md border border-line bg-elevated px-2 py-1 text-[13px] text-fg outline-none focus-visible:border-brand-500 disabled:opacity-50"
    />
  </label>;
}
