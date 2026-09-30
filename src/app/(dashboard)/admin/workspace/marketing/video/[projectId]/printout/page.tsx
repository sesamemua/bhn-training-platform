/**
 * A video project's Printout tab: things to print for the shoot day —
 * for now, the "filming in progress" notice for the door.
 */
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { FilmingNoticeEditor } from "@/components/workspace/FilmingNoticeEditor";
import { clockOf, hhmmToMinutes, longDate } from "@/lib/video/filming";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function PrintoutPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, filming: { select: { date: true, location: true, opensAt: true, closesAt: true } } },
  });
  if (!project) notFound();
  const f = project.filming;
  // The notice says when and where from the filming day, when there is one.
  const when = f
    ? `${longDate(f.date.toISOString().slice(0, 10)).replace(/, \d{4}$/, "")} · ${clockOf(hhmmToMinutes(f.opensAt))} – ${clockOf(hhmmToMinutes(f.closesAt))}`
    : "Today";

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Printer size={11} /> Video Production · Printout</>}
        title={project.title}
        description="Things to print for the shoot day. The filming notice goes on the door: edit the words, check the preview, print on letter paper."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <FilmingNoticeEditor
        initial={{
          subhead: "Filming in progress",
          headline: "Quiet please",
          when,
          where: f?.location ?? "",
          message: "We're filming interviews here today. Please keep your voice down and take phone calls elsewhere as you pass by — thank you for bearing with us!",
          thanks: "Thank you!",
        }}
      />
    </div>
  );
}
