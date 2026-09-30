"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createFilmingSchedule } from "@/lib/video/filming-actions";

/** A project without a filming day yet: pick the date to start one. */
export function CreateFilmingDay({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="max-w-md rounded-xl border border-dashed border-line p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createFilmingSchedule(projectId, date);
          if (r.ok) router.refresh();
          else setError(r.error);
        });
      }}
    >
      <p className="flex items-center gap-2 text-[14px] font-bold text-fg"><CalendarClock size={16} className="text-brand-500" /> Plan the filming day</p>
      <p className="mt-1 text-[12.5px] text-muted">Pick the shoot date. You can then add the people and lay out the day.</p>
      <div className="mt-3 flex gap-2">
        <input id="filming-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-line bg-card px-2 py-1.5 text-[13px] text-fg" />
        <button type="submit" disabled={pending || !date} className="rounded-lg bg-brand-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Start</button>
      </div>
      {error && <p role="alert" className="mt-2 text-[12.5px] text-rose-600">{error}</p>}
    </form>
  );
}
