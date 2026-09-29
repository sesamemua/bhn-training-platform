/**
 * "I can't make it" for one session, from a registrant's pass or letter.
 *
 * Not a cancel button. It asks why — a reason is required — releases the
 * place so somebody waiting can have it, and tells the team. Phone-first,
 * like the pass it comes from.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { prisma } from "@/lib/prisma";
import { NO_SHOW_NOTE } from "@/lib/training-week/check-in";
import { CantAttendForm } from "@/components/training-week/CantAttendForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "I can't make it", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

const tz = "America/Toronto";
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(d);

export default async function CantAttendPage({ params }: { params: Promise<{ token: string; bookingId: string }> }) {
  const { token, bookingId } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[a-z0-9]{10,40}$/i.test(bookingId)) notFound();

  const seat = await prisma.workshopBooking.findFirst({
    where: { id: bookingId, submission: { checkInToken: token } },
    select: {
      status: true, withdrawnAt: true,
      workshop: { select: { title: true, startDateTime: true, locationName: true } },
    },
  });
  if (!seat) notFound();

  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <Link href={`/training-week/pass/${token}`} className="text-[13px] font-semibold text-slate-600 underline underline-offset-2">
          ← Back to your pass
        </Link>
        <h1 className="mt-3 text-[clamp(1.35rem,6vw,1.75rem)] font-bold leading-tight tracking-tight">I can&apos;t make it</h1>
        <div className="mt-3 rounded-xl border border-slate-200 px-3.5 py-3">
          <p className="text-[15px] font-bold leading-snug">{seat.workshop.title}</p>
          <p className="text-[13px] text-slate-600">{when(seat.workshop.startDateTime)}</p>
          {seat.workshop.locationName && <p className="text-[13px] text-slate-600">{seat.workshop.locationName}</p>}
        </div>

        {seat.withdrawnAt ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-[14px] leading-relaxed text-emerald-900">
            You told us on {when(seat.withdrawnAt)} that you can&apos;t make it. Your place has been released — thank you for letting us know.
          </p>
        ) : seat.status !== "confirmed" ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[14px] leading-relaxed text-slate-700">
            You don&apos;t have a confirmed place in this session, so there is nothing to release.
          </p>
        ) : (
          <>
            <p className="mt-4 text-[14px] leading-relaxed text-slate-700">
              Please tell us why you can&apos;t come. Your place will be released so somebody waiting for it can have it, and the
              BioHubNet team will see your reason.
            </p>
            <CantAttendForm token={token} bookingId={bookingId} />
            <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">{NO_SHOW_NOTE}</p>
          </>
        )}
      </div>
    </main>
  );
}
