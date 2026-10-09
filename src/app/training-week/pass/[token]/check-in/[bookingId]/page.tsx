/**
 * Self check-in for one session, from the button in a reminder or on the
 * pass. Opening the page records nothing — mail scanners open links —
 * so checking in is a tap on the page. It opens 30 minutes before the
 * session starts; before that the page says when to come back.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { prisma } from "@/lib/prisma";
import { SELF_CHECK_IN_EARLY_MS, selfCheckIn } from "@/lib/training-week/check-in";
import { SelfCheckInButton } from "@/components/training-week/SelfCheckInButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check in", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

const tz = "America/Toronto";
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(d);
const clock = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);

export default async function SelfCheckInPage({ params }: { params: Promise<{ token: string; bookingId: string }> }) {
  const { token, bookingId } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[a-z0-9]{10,40}$/i.test(bookingId)) notFound();

  const seat = await prisma.workshopBooking.findFirst({
    where: { id: bookingId, submission: { checkInToken: token } },
    select: { status: true, checkedInAt: true, workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true } } },
  });
  if (!seat) notFound();
  const w = seat.workshop;
  const state = selfCheckIn({ status: seat.status, checkedInAt: seat.checkedInAt, start: w.startDateTime, end: w.endDateTime });
  const opens = new Date(w.startDateTime.getTime() - SELF_CHECK_IN_EARLY_MS);
  const cancel = (
    <p className="mt-4 text-[13.5px] text-slate-700">
      Not coming?{" "}
      <Link href={`/training-week/pass/${token}/cant-attend/${bookingId}`} className="font-semibold underline underline-offset-2">Cancel my place</Link>
    </p>
  );

  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <Link href={`/training-week/pass/${token}`} className="text-[13px] font-semibold text-slate-600 underline underline-offset-2">
          ← Back to your pass
        </Link>
        <h1 className="mt-3 text-[clamp(1.35rem,6vw,1.75rem)] font-bold leading-tight tracking-tight">Check in</h1>
        <div className="mt-3 rounded-xl border border-slate-200 px-3.5 py-3">
          <p className="text-[15px] font-bold leading-snug">{w.title}</p>
          <p className="text-[13px] text-slate-600">{when(w.startDateTime)}</p>
          {/* The room only once check-in is open — by then it has been sent to them. */}
          {w.locationName && (state === "open" || state === "already") && <p className="text-[13px] text-slate-600">{w.locationName}</p>}
        </div>

        {state === "already" ? (
          <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-[15px] font-semibold leading-relaxed text-emerald-900">
            You are checked in{seat.checkedInAt ? ` — ${clock(seat.checkedInAt)}` : ""}. Enjoy the session.
          </p>
        ) : state === "no_place" ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[14px] leading-relaxed text-slate-700">
            You don&apos;t have a confirmed place in this session, so there is nothing to check in to.
          </p>
        ) : state === "early" ? (
          <>
            <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-[14px] leading-relaxed text-amber-900">
              Check-in opens 30 minutes before the session starts — at {clock(opens)} on {when(opens).split(" at ")[0]}. Come back to this page then.
            </p>
            {cancel}
          </>
        ) : state === "over" ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[14px] leading-relaxed text-slate-700">
            This session has ended, so check-in is closed.
          </p>
        ) : (
          <>
            <SelfCheckInButton token={token} bookingId={bookingId} />
            {cancel}
          </>
        )}
      </div>
    </main>
  );
}
