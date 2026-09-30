/**
 * A video project's Sign-ups tab: the public link trainees use to book a
 * filming slot, its settings, and who has signed up.
 */
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { SignupAdmin } from "@/components/workspace/SignupAdmin";
import { minuteOfDay } from "@/lib/video/filming";
import { offers, takenSpans } from "@/lib/video/signup";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function SignupsPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true,
      filming: {
        select: {
          id: true, bookingToken: true, isOpen: true, openFrom: true, openTo: true, slotMinutes: true, prepMinutes: true,
          blocks: { select: { title: true, start: true, end: true, prepMinutes: true, locked: true, people: true } },
          people: { where: { signedUpAt: { not: null } }, orderBy: { signedUpAt: "asc" }, select: { id: true, name: true, email: true, parking: true, signedUpAt: true } },
        },
      },
    },
  });
  if (!project) notFound();
  const day = project.filming;
  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host") ?? "bhn-training-platform.vercel.app"}`;

  const hero = (
    <PageHero
      eyebrow={<><UserPlus size={11} /> Video Production · Sign-ups</>}
      title={project.title}
      description="A link for trainees to sign up for a filming slot: they see the day, pick a time that doesn't clash with anything locked (preparation included), and say whether they need parking."
      actions={<ProjectBackLink />}
    />
  );
  if (!day) {
    return <div className="space-y-4">{hero}<ProjectNav projectId={project.id} /><p className="text-[13px] text-muted">Plan the filming day first — sign-ups book into it.</p></div>;
  }
  const blocks = day.blocks.map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
  const taken = takenSpans(blocks);
  const rows = day.people.map((p) => {
    const slot = blocks.find((b) => b.people.length === 1 && b.people[0] === p.id);
    return { id: p.id, name: p.name, email: p.email, parking: p.parking, signedUpAt: p.signedUpAt!.toISOString(), start: slot ? minuteOfDay(slot.start) : null, end: slot ? minuteOfDay(slot.end) : null };
  });

  return (
    <div className="space-y-4">
      {hero}
      <ProjectNav projectId={project.id} />
      <SignupAdmin
        scheduleId={day.id}
        link={day.bookingToken ? `${origin}/film/${day.bookingToken}` : null}
        isOpen={day.isOpen}
        settings={{ openFrom: day.openFrom, openTo: day.openTo, slotMinutes: day.slotMinutes, prepMinutes: day.prepMinutes }}
        taken={taken}
        offers={offers({ from: day.openFrom, to: day.openTo, slot: day.slotMinutes, prep: day.prepMinutes, taken })}
        rows={rows}
      />
    </div>
  );
}
