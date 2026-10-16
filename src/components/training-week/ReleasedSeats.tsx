/**
 * "People have released their seats" — on the home dashboard and the
 * Training Week dashboard. Each line is somebody who gave up a place
 * themselves, and whether that session has room to give it to somebody
 * else. The last two days are listed; "See all" opens the last three
 * weeks. Nothing is shown when nobody has released anything lately.
 *
 * A server component: it loads its own few rows.
 */
import Link from "next/link";
import { ArrowRight, Armchair } from "lucide-react";
import { loadReleasedSeats, type ReleasedSeat } from "@/lib/training-week/capacity-server";

const RECENT_MS = 2 * 24 * 60 * 60 * 1000;

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export async function ReleasedSeats({ framed = false, showEmpty = false }: { framed?: boolean; showEmpty?: boolean }) {
  const seats = await loadReleasedSeats().catch(() => null);
  if (!seats?.length) return showEmpty ? <article className="aero-frame"><div className="aero-card"><h3 className="aero-h"><Armchair size={14} /> Seats released</h3><p className="text-sm text-muted">{seats ? "No recently released seats." : "Couldn't load released seats. Reload the dashboard to retry."}</p></div></article> : null;
  // The last two days lead; everything from the last three weeks is a click away.
  const since = Date.now() - RECENT_MS;
  const recent = seats.filter((s) => new Date(s.at).getTime() >= since);
  const open = recent.filter((s) => s.free > 0);
  const list = (rows: ReleasedSeat[]) => (
    <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-[12.5px]">
      {rows.map((s) => (
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
  );
  const body = (
    <>
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600"><Armchair size={16} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-fg">
            {recent.length
              ? <>{recent.length} seat{recent.length === 1 ? "" : "s"} released by registrants in the last 2 days</>
              : "No seats released in the last 2 days"}
            {open.length > 0 && <span className="font-semibold text-amber-700"> · {open.length} can be given to somebody else</span>}
          </p>
          <p className="text-[12px] text-muted">People who told us they can&apos;t make it. Their place is free to offer to somebody waiting.</p>
        </div>
        <Link href="/admin/workspace/training-admin" className="col-span-2 inline-flex items-center justify-self-start gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700 sm:col-span-1">
          Open the Training Week dashboard <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
      {recent.length > 0 && list(recent)}
      {seats.length > recent.length && (
        <details className="mt-2 text-[12.5px]">
          <summary className="cursor-pointer font-semibold text-muted hover:text-fg">
            See all {seats.length} seat{seats.length === 1 ? "" : "s"} released in the last three weeks
          </summary>
          {list(seats)}
        </details>
      )}
    </>
  );
  return framed
    ? <article className="aero-frame"><div className="aero-card">{body}</div></article>
    : <section className="rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-4">{body}</section>;
}
