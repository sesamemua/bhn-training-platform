/**
 * Public speaker-intake page — /events/<slug>/speaker.
 *
 * No login: the people filling this in are invited guests who will never
 * have a platform account. Same shape as the public showcase submission
 * page, which solves the identical problem for graduates.
 */
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SpeakerIntakeForm } from "@/components/events/SpeakerIntakeForm";
import { speakerLimits } from "@/lib/events/limits";
import styles from "./speaker-intake.module.css";

export const dynamic = "force-dynamic";

export default async function SpeakerIntakePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: {
      title: true,
      tagline: true,
      speakerIntakeOpen: true,
      speakerBioMaxWords: true,
      speakerPitchMaxWords: true,
    },
  });
  if (!event) notFound();

  const limits = speakerLimits(event);

  return (
    <main
      data-theme="light"
      className={`${styles.daylight} min-h-screen bg-gradient-to-b from-[var(--speaker-page-tint)] to-white px-4 py-12`}
    >
      <div className="mx-auto max-w-xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--brand-700)]">
          {event.title}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold text-[var(--speaker-control-ink)]">Speaker details</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--speaker-copy)]">
          Thanks for joining us. What you enter here is what appears beside your
          name on the event website — so use the headshot and wording you would
          like published.
        </p>

        {event.speakerIntakeOpen ? (
          <div className="mt-7">
            <SpeakerIntakeForm
              slug={slug}
              bioMaxWords={limits.bio}
            />
          </div>
        ) : (
          <p className="mt-7 rounded-xl border border-[var(--speaker-warning-line)] bg-[var(--speaker-warning-bg)] px-4 py-3 text-[13.5px] text-[var(--speaker-warning-ink)]">
            We aren’t collecting speaker details for this event at the moment. If
            you were asked to fill this in, please reply to the invitation and
            we’ll reopen it.
          </p>
        )}
      </div>
    </main>
  );
}
