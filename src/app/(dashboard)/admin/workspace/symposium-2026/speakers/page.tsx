/**
 * Workspace → 2026 Symposium → Speakers.
 *
 * The same manager as Administration → Events → … → Speakers, on the
 * group that owns the work. Running the symposium meant knowing that
 * speaker details are filed under the events module rather than under
 * the symposium — true, and not something anybody should have to
 * remember.
 *
 * Its own route rather than a link across to the events page, for the
 * reason the Registration Form has one: the sidebar decides what to
 * highlight from the PATHNAME, and /admin/events/… would light up the
 * Events entry in Administration instead of this one.
 */
import { redirect, notFound } from "next/navigation";
import { Mic } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { SpeakersManager, type SpeakerRow } from "@/components/admin/events/SpeakersManager";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";

export const dynamic = "force-dynamic";

const HERE = "/admin/workspace/symposium-2026/speakers";

export default async function SymposiumSpeakersPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect(await deniedRedirect(HERE));

  const event = await prisma.bhnEvent.findUnique({
    where: { slug: EVENT_SLUG },
    select: { id: true, title: true, speakerIntakeOpen: true },
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
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow={<><Mic size={11} /> Workspace · 2026 Symposium</>}
        title="Speakers & panellists"
        description="Send invited speakers one link and they fill in their own headshot, title, organisation, bio, LinkedIn and what their session offers — no account needed. Everything they submit appears here for you to check before it goes on the website."
      />
      <div className="mx-auto max-w-3xl space-y-6 pb-12">
        <SpeakersManager slug={EVENT_SLUG} intakeOpen={event.speakerIntakeOpen} initialSpeakers={rows} />
      </div>
    </>
  );
}
