/**
 * Admin → event → Speakers. Open the public intake link, hand it to the
 * invited guests, and review what comes back.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { SpeakersManager, type SpeakerRow } from "@/components/admin/events/SpeakersManager";
import { speakerLimits } from "@/lib/events/limits";

export const dynamic = "force-dynamic";

export default async function EventSpeakersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireRole("admin").catch(() => null);
  const { slug } = await params;
  if (!session) redirect(await deniedRedirect(`/admin/events/${slug}/speakers`));

  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      speakerIntakeOpen: true,
      speakerBioMaxWords: true,
      speakerPitchMaxWords: true,
    },
  });
  if (!event) notFound();

  const speakers = await prisma.speaker.findMany({
    where: { eventId: event.id },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  const rows: SpeakerRow[] = speakers.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    title: s.title,
    organization: s.organization,
    bio: s.bio,
    topics: s.topics,
    linkedinUrl: s.linkedinUrl,
    sessionPitch: s.sessionPitch,
    photoUrl: s.photoUrl,
    contactEmail: s.contactEmail,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    displayOrder: s.displayOrder,
  }));

  return (
    <div>
      <PageHero
        eyebrow={<><Mic size={11} /> Admin · {event.title}</>}
        title="Speakers & panellists"
        description="Send invited speakers one link and they fill in their own headshot, title, organisation, bio and topics — no account needed. Everything they submit appears here for you to check before it goes on the website."
      />
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-12 sm:px-6">
        <Link
          href={`/admin/events/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
        >
          <ArrowLeft size={14} /> Back to event
        </Link>
        <SpeakersManager
          slug={slug}
          intakeOpen={event.speakerIntakeOpen}
          initialSpeakers={rows}
          limits={speakerLimits(event)}
          storedLimits={{
            bio: event.speakerBioMaxWords,
            pitch: event.speakerPitchMaxWords,
          }}
        />
      </div>
    </div>
  );
}
