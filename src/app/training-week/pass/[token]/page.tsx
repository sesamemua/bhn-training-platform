/**
 * A registrant's Training Week pass: their name, the QR they show at the
 * door, and the sessions it gets them into.
 *
 * Opened from the link in their letters. The code in the URL is the only
 * key — there is no account behind a public registration — so the page
 * shows this one person's seats and nothing else, and is kept out of
 * search engines. It prints on one page for anybody who would rather
 * bring paper.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode-svg";
import { prisma } from "@/lib/prisma";
import { registrantName } from "@/lib/allocation/registrant-name";
import { passQrContent } from "@/lib/training-week/check-in";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Training Week pass",
  robots: { index: false, follow: false },
};

const tz = "America/Toronto";
const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);

/** What each seat means for the person holding the pass. */
const SEAT: Record<string, { label: string; note: string; tone: string }> = {
  confirmed: { label: "You have a place", note: "Show this pass at the door.", tone: "border-emerald-500/50 bg-emerald-50 text-emerald-900" },
  waitlist: { label: "Waitlisted", note: "Come to the door — if there is space when the session starts, you will be let in.", tone: "border-amber-500/50 bg-amber-50 text-amber-900" },
  pending: { label: "Not decided yet", note: "We will write to you. If you come anyway, you will be let in if there is space.", tone: "border-slate-300 bg-slate-50 text-slate-800" },
};

export default async function TrainingWeekPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

  const sub = await prisma.eventFormSubmission.findUnique({
    where: { checkInToken: token },
    select: {
      data: true, email: true,
      bookings: {
        where: { status: { not: "cancelled" } },
        select: {
          id: true, status: true, checkedInAt: true,
          workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true } },
        },
      },
    },
  });
  if (!sub) notFound();

  const name = registrantName((sub.data ?? {}) as Record<string, unknown>) || sub.email || "";
  const seats = [...sub.bookings].sort((a, b) => a.workshop.startDateTime.getTime() - b.workshop.startDateTime.getTime());
  const qr = new QRCode({
    content: passQrContent(token), width: 240, height: 240, padding: 2, color: "#0b1b3b", background: "#ffffff", ecl: "M",
  }).svg();

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 print:py-0">
      <div className="mx-auto max-w-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">BioHubNet Training Week 2026</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{name}</h1>
        <p className="text-[13px] text-slate-600">{sub.email}</p>

        <div className="mt-5 flex flex-col items-center rounded-2xl border border-slate-200 p-5">
          {/* Server-made SVG from a fixed library: no user content inside it
              but the random code itself. */}
          <div className="h-[240px] w-[240px]" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-3 text-center text-[13px] font-semibold">Show this at the door of each session</p>
          <p className="text-center text-[12px] text-slate-600">Screen brightness up helps the scanner. A printed copy works too.</p>
        </div>

        <h2 className="mt-6 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">Your sessions</h2>
        {seats.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-600">No sessions on this registration.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {seats.map((s) => {
              const k = SEAT[s.status] ?? SEAT.pending;
              return (
                <li key={s.id} className={`rounded-xl border px-3.5 py-2.5 ${k.tone}`}>
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[14px] font-bold">{s.workshop.title}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wide">{s.checkedInAt ? `Checked in ${time(s.checkedInAt)}` : k.label}</span>
                  </p>
                  <p className="text-[12.5px]">
                    {day(s.workshop.startDateTime)} · {time(s.workshop.startDateTime)}–{time(s.workshop.endDateTime)}
                    {s.workshop.locationName ? ` · ${s.workshop.locationName}` : ""}
                  </p>
                  {!s.checkedInAt && <p className="mt-0.5 text-[12px] opacity-80">{k.note}</p>}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-[12px] leading-relaxed text-slate-500">
          This page is yours alone — anyone with its link can see it, so please don&apos;t share it.
          Questions: <a className="underline" href="mailto:info@biohubnet.ca">info@biohubnet.ca</a>
        </p>
      </div>
    </main>
  );
}
