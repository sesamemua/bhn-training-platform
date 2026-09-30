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
import { ScriptPrint } from "@/components/workspace/ScriptPrint";
import { clockOf, hhmmToMinutes, longDate } from "@/lib/video/filming";
import { mergeSigns, parseSigns, printoutsKey, type Sign } from "@/lib/video/filming-notice";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function PrintoutPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true,
      filming: { select: { date: true, location: true, opensAt: true, closesAt: true } },
      // Read fresh on every visit: the printout is never a frozen copy.
      scripts: { where: { isArchived: false }, orderBy: { order: "asc" }, select: { id: true, title: true, format: true, richContent: true, updatedAt: true } },
    },
  });
  if (!project) notFound();
  const f = project.filming;
  // The notice says when and where from the filming day, when there is one.
  const when = f
    ? `${longDate(f.date.toISOString().slice(0, 10)).replace(/, \d{4}$/, "")} · ${clockOf(hhmmToMinutes(f.opensAt))} – ${clockOf(hhmmToMinutes(f.closesAt))}`
    : "Today";

  const builtIn: Sign[] = [
    {
      id: "quiet",
      custom: false,
      kind: "sign",
      label: "Quiet please",
      fields: {
        subhead: "Filming in progress",
        headline: "Quiet please",
        when,
        where: f?.location ?? "",
        message: "We're filming interviews here today. Please keep your voice down and take phone calls elsewhere as you pass by — thank you for bearing with us!",
        thanks: "Thank you!",
        writeIn: "",
      },
    },
    {
      id: "closed",
      custom: false,
      kind: "sign",
      label: "Area closed",
      fields: {
        subhead: "Filming in progress",
        headline: "This area is closed for filming",
        when,
        where: f?.location ?? "",
        message: "Please don't walk through while we're filming. We're sorry for the detour, and we'll be out of your way as soon as we can.",
        thanks: "Thank you for understanding!",
        writeIn: "",
      },
    },
    {
      id: "entrance",
      custom: false,
      kind: "sign",
      label: "Use the other entrance",
      fields: {
        subhead: "Filming in progress",
        headline: "Please use the other entrance",
        when,
        where: "The entrance on College Street is open",
        message: "This door is closed while we film inside. Please go around to the College Street entrance — thank you for helping us keep the shot quiet.",
        thanks: "Thank you!",
        writeIn: "",
      },
    },
    {
      id: "loading",
      custom: false,
      kind: "sign",
      label: "Windshield — loading",
      fields: {
        subhead: "Loading film equipment",
        headline: "Loading — back shortly",
        when,
        where: f?.location ?? "",
        message: "We're unloading equipment for a filming day in the building and will move this car as soon as we're done. Need it moved sooner? Please give us a call — we'll come right out.",
        thanks: "Thank you for your patience!",
        writeIn: "Call or text:",
      },
    },
    {
      id: "release",
      custom: false,
      kind: "release",
      label: "Release form",
      fields: {
        subhead: project.title.replace(/ Project$/, ""),
        headline: "Photo, video & audio release",
        when: f ? longDate(f.date.toISOString().slice(0, 10)) : "",
        where: f?.location ?? "",
        message:
          "I give BioHubNet (Biomanufacturing Hub Network), at the Leslie Dan Faculty of Pharmacy, University of Toronto, permission to photograph me and record me on video and audio at the shoot above, and to use, edit, copy and share those recordings to describe and promote BioHubNet and the University of Toronto — on websites and social media, in videos, presentations, reports and printed material, now and later. I will not be paid for this, and I do not need to approve the final edit. I can ask BioHubNet at any time to stop using my image in anything new; material already published or printed may not be withdrawn.",
        thanks: "Questions, or to stop future use of your image: info@biohubnet.ca",
        writeIn: "",
      },
    },
  ];
  const saved = await prisma.platformSetting.findUnique({ where: { key: printoutsKey(project.id) }, select: { value: true } });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Printer size={11} /> Video Production · Print job</>}
        title={project.title}
        description="Everything to print for the shoot day — door signs, the windshield loading notice, the release form, any you make, and the scripts, pulled live. Check the preview, print on letter paper."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <FilmingNoticeEditor
        projectId={project.id}
        builtIn={builtIn}
        initial={mergeSigns(builtIn, parseSigns(saved?.value))}
      />
      <ScriptPrint
        projectTitle={project.title}
        scripts={project.scripts.flatMap((s) => {
          const rc = (s.richContent ?? null) as { html?: string; css?: string } | null;
          return s.format === "html" && rc?.html ? [{ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString(), html: rc.html, css: rc.css ?? "" }] : [];
        })}
      />
    </div>
  );
}
