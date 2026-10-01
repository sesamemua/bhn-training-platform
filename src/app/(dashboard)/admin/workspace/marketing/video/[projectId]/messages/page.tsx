/**
 * A video project's Messages tab: the email to the people being filmed —
 * the scientific directors — as a template, filled in per person from the
 * Filming day. Copy it or open it in your own email; nothing is sent here.
 */
import { notFound, redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { ProjectNav } from "@/components/workspace/ProjectNav";
import { ProjectBackLink } from "@/components/workspace/ProjectBackLink";
import { MessageTemplates } from "@/components/workspace/MessageTemplates";
import { fieldsFor, messagesKey, parseTemplate } from "@/lib/video/messages";

export const dynamic = "force-dynamic";
interface Props { params: Promise<{ projectId: string }> }

export default async function MessagesPage({ params }: Props) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { projectId } = await params;
  const project = await prisma.videoProject.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true,
      filming: {
        select: {
          date: true, location: true,
          people: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, group: true } },
          blocks: { select: { kind: true, title: true, start: true, end: true, prepMinutes: true, people: true, facilitators: true } },
        },
      },
    },
  });
  if (!project) notFound();
  const saved = await prisma.platformSetting.findUnique({ where: { key: messagesKey(projectId) }, select: { value: true } });
  const f = project.filming;
  const people = f?.people ?? [];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "someone";
  const slots = (f?.blocks ?? []).map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
  const sender = (session.user as { name?: string | null }).name ?? "The BioHubNet team";
  // ponytail: the scientific directors are the Interviewees group; add a group picker if other groups need letters.
  const recipients = f
    ? people.filter((p) => p.group === "interviewee").map((p) => ({ id: p.id, name: p.name, email: p.email, ...fieldsFor(p, { date: f.date.toISOString().slice(0, 10), location: f.location }, slots, nameOf, sender) }))
    : [];

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={<><Mail size={11} /> Video Production · Messages</>}
        title={project.title}
        description="The email to the scientific directors — their time, the lead-in to settle in and go over the questions, what to wear, make-up, and catering — filled in for each of them from the Filming day. Copy it or open it in your email; nothing is sent from here."
        actions={<ProjectBackLink />}
      />
      <ProjectNav projectId={project.id} />
      <MessageTemplates projectId={project.id} initial={parseTemplate(saved?.value)} recipients={recipients} />
    </div>
  );
}
