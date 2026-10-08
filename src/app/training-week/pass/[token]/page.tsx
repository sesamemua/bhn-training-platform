/**
 * A registrant's Training Week pass: their name, the QR they show at the
 * door, and the sessions it gets them into.
 *
 * Approved sessions only. A waitlisted or undecided seat is not shown:
 * the pass is not an invitation to turn up and hope. With nothing
 * approved there is no QR either, just a line saying we will write.
 *
 * Made to be held up on a phone: the QR takes most of the screen width
 * on a small phone and stops growing on a large one, and nothing on the
 * page is wider than the screen. It still prints on one page.
 *
 * The code in the URL is the only key — there is no account behind a
 * public registration — so the page shows this one person's seats and
 * nothing else, and is kept out of search engines.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import QRCode from "qrcode-svg";
import { prisma } from "@/lib/prisma";
import { registrantName } from "@/lib/allocation/registrant-name";
import { NO_SHOW_NOTE, passQrContent } from "@/lib/training-week/check-in";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Training Week pass",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

const tz = "America/Toronto";
const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);

export default async function TrainingWeekPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

  const sub = await prisma.eventFormSubmission.findUnique({
    where: { checkInToken: token },
    select: {
      data: true, email: true,
      bookings: {
        where: { status: "confirmed" },
        select: {
          id: true, checkedInAt: true,
          workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true, attendeeNote: true } },
        },
      },
    },
  });
  if (!sub) notFound();

  const name = registrantName((sub.data ?? {}) as Record<string, unknown>) || sub.email || "";
  const seats = [...sub.bookings].sort((a, b) => a.workshop.startDateTime.getTime() - b.workshop.startDateTime.getTime());
  // viewBox, no fixed size: the box around it decides how big it is.
  const qr = seats.length
    ? new QRCode({ content: passQrContent(token), padding: 2, color: "#0b1b3b", background: "#ffffff", ecl: "M", container: "svg-viewbox", join: true }).svg()
    : null;

  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-slate-900 sm:py-10 print:py-0">
      <div className="mx-auto w-full max-w-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">BioHubNet Training Week 2026</p>
        <h1 className="mt-1 break-words text-[clamp(1.4rem,6vw,1.9rem)] font-bold leading-tight tracking-tight">{name}</h1>
        <p className="break-all text-[13px] text-slate-600">{sub.email}</p>

        {qr ? (
          <div className="mt-5 flex flex-col items-center rounded-2xl border border-slate-200 px-4 py-5">
            {/* Server-made SVG from a fixed library: nothing in it but the random code. */}
            <div
              className="aspect-square w-[min(78vw,340px)] [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <p className="mt-3 text-center text-[15px] font-semibold">Show this at the door of each session</p>
            <p className="text-center text-[12.5px] text-slate-600">Turn your screen brightness up. A printed copy works too.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-[14px] leading-relaxed text-slate-700">
            You don&apos;t have a confirmed place in a session yet. We will email you if that changes — your pass will be here
            then.
          </div>
        )}

        {seats.length > 0 && (
          <>
            <h2 className="mt-6 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">Your sessions</h2>
            <ul className="mt-2 space-y-2">
              {seats.map((s) => (
                <li key={s.id} className="rounded-xl border border-emerald-500/50 bg-emerald-50 px-3.5 py-3 text-emerald-950">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-[15px] font-bold leading-snug">{s.workshop.title}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide">
                      {s.checkedInAt ? `Checked in ${time(s.checkedInAt)}` : "You have a place"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px]">
                    {day(s.workshop.startDateTime)} · {time(s.workshop.startDateTime)}–{time(s.workshop.endDateTime)}
                  </p>
                  {s.workshop.locationName && <p className="text-[13px]">{s.workshop.locationName}</p>}
                  {s.workshop.attendeeNote && <p className="mt-1 whitespace-pre-wrap text-[13px]">{s.workshop.attendeeNote}</p>}
                  {!s.checkedInAt && (
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 print:hidden">
                      <Link href={`/training-week/pass/${token}/check-in/${s.id}`} className="text-[13px] font-semibold text-emerald-900 underline underline-offset-2">
                        Check in
                      </Link>
                      <Link href={`/training-week/pass/${token}/cant-attend/${s.id}`} className="text-[13px] font-semibold text-emerald-900 underline underline-offset-2">
                        Cancel my place
                      </Link>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">{NO_SHOW_NOTE}</p>
          </>
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
          This page is yours alone — anyone with its link can see it, so please don&apos;t share it. Questions:{" "}
          <a className="underline" href="mailto:info@biohubnet.ca">info@biohubnet.ca</a>
        </p>
      </div>
    </main>
  );
}
