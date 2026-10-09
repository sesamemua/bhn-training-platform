/**
 * "People have released their seats" — on the home dashboard and the
 * Training Week dashboard. Each line is somebody who gave up a place
 * themselves, and whether that session has room to give it to somebody
 * else. Nothing is shown when nobody has released anything lately.
 *
 * A server component: it loads its own few rows.
 */
import Link from "next/link";
import { ArrowRight, Armchair } from "lucide-react";
import { loadReleasedSeats } from "@/lib/training-week/capacity-server";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export async function ReleasedSeats({ framed = false }: { framed?: boolean }) {
  const seats = await loadReleasedSeats().catch(() => []);
  if (!seats.length) return null;
  const open = seats.filter((s) => s.free > 0);
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600"><Armchair size={16} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-fg">
            {seats.length} seat{seats.length === 1 ? "" : "s"} released by registrants
            {open.length > 0 && <span className="font-semibold text-amber-700"> · {open.length} can be given to somebody else</span>}
          </p>
          <p className="text-[12px] text-muted">People who told us they can&apos;t make it, in the last three weeks. Their place is free to offer to somebody waiting.</p>
        </div>
        <Link href="/admin/workspace/training-admin?tab=registrants" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700">
          Assign from registrants <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-[12.5px]">
        {seats.map((s) => (
          <li key={s.bookingId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="font-semibold text-fg">{s.name}</span>
            <span className="text-muted">released <strong className="font-semibold text-fg">{s.session}</strong></span>
            <span className="text-subtle">{when(s.at)}</span>
            <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-bold ${s.free > 0 ? "bg-amber-500/15 text-amber-700" : "bg-elevated text-subtle"}`}>
              {s.free > 0 ? `${s.free} seat${s.free === 1 ? "" : "s"} free in this session` : "Session is full again"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
  return framed
    ? <article className="aero-frame"><div className="aero-card">{body}</div></article>
    : <section className="rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-4">{body}</section>;
}
