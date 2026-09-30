/**
 * /film/[token] — PUBLIC sign-up for a filming slot. Outside the
 * (dashboard) group, so no login: the token is the access. Trainees see
 * the day as a chart, pick a start (preparation included) that does not
 * clash with anything locked, and say whether they need parking.
 */
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { longDate } from "@/lib/video/filming";
import { offers, takenSpans } from "@/lib/video/signup";
import { FilmSignupForm } from "@/components/workspace/FilmSignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign up for filming", robots: { index: false, follow: false } };
interface Props { params: Promise<{ token: string }> }

export default async function FilmSignupPage({ params }: Props) {
  const { token } = await params;
  const day = await prisma.filmingSchedule.findUnique({
    where: { bookingToken: token },
    select: {
      isOpen: true, date: true, location: true, openFrom: true, openTo: true, slotMinutes: true, prepMinutes: true,
      project: { select: { title: true } },
      blocks: { select: { start: true, end: true, prepMinutes: true, locked: true } },
    },
  });
  if (!day) return <Shell><Notice title="This link isn't valid" body="Ask the person who sent it for a fresh link." /></Shell>;
  const when = longDate(day.date.toISOString().slice(0, 10));
  if (!day.isOpen) return <Shell><Notice title="Sign-ups are closed" body={`Sign-ups for filming on ${when} are closed. Ask the team if you'd still like to take part.`} /></Shell>;

  const taken = takenSpans(day.blocks.map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() })));
  return (
    <Shell>
      <div className="mx-auto w-full max-w-3xl space-y-5 rounded-2xl border border-line bg-card-solid p-5 shadow-elevated sm:p-7">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">BioHubNet · {day.project.title}</p>
          <h1 className="mt-1 text-[22px] font-bold text-fg">Sign up for a filming slot</h1>
          <p className="mt-1 text-[14px] text-muted"><strong className="text-fg">{when}</strong>{day.location && <> · {day.location}</>}</p>
        </header>
        <FilmSignupForm
          token={token}
          from={day.openFrom} to={day.openTo} slot={day.slotMinutes} prep={day.prepMinutes}
          taken={taken}
          offers={offers({ from: day.openFrom, to: day.openTo, slot: day.slotMinutes, prep: day.prepMinutes, taken })}
          where={day.location} when={when}
        />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main data-theme="light" className="min-h-screen bg-elevated/40 px-4 py-8 text-fg sm:px-6">{children}</main>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-20 w-full max-w-md rounded-2xl border border-line bg-card-solid p-6 text-center shadow-elevated">
      <h1 className="text-lg font-bold text-fg">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
