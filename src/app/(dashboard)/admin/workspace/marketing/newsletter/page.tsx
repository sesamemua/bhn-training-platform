/**
 * Workspace → Marketing → Newsletter. Colleagues drop contributions into
 * ENGAGE / EXPERIENCE / EQUIP / EVENTS; an editor runs the AI layout and
 * copies the Mailchimp fragment out.
 *
 * The current issue is created lazily so the tab always resolves: on a
 * fresh database the first visit opens a draft for the current month.
 */
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireRole, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { resolveCurrentIssue } from "@/lib/newsletter/currentIssue";
import { NewsletterClient } from "@/components/workspace/NewsletterClient";
import { NewsletterNav } from "@/components/workspace/NewsletterNav";

export const dynamic = "force-dynamic";

export default async function NewsletterWorkshopPage() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect("/dashboard");

  const role = (session.user as { role?: string }).role ?? "user";
  const canEdit = role === "admin" || role === "superadmin";
  const meId = (session.user as { id?: string }).id ?? null;

  // The issue for the month the calendar says we are producing. Before
  // this, Compose asked for "the most recent unsent issue" — which never
  // rolled over, so every month's contributions stacked onto one draft.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const resolved = await resolveCurrentIssue(today);
  let issue = await prisma.newsletterIssue.findUnique({
    where: { id: resolved.issueId },
    include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
  });
  if (!issue) {
    const month = new Date().toLocaleString("en-CA", { month: "long", year: "numeric" });
    const created = await prisma.newsletterIssue.create({
      data: { title: `${month} Newsletter`, dateline: month, createdById: meId },
      select: { id: true },
    });
    issue = await prisma.newsletterIssue.findUniqueOrThrow({
      where: { id: created.id },
      include: { pieces: { orderBy: [{ section: "asc" }, { position: "asc" }] } },
    });
  }

  const initialIssue = {
    id: issue.id,
    title: issue.title,
    dateline: issue.dateline,
    status: issue.status,
    renderedHtml: issue.renderedHtml,
    renderedAt: issue.renderedAt ? issue.renderedAt.toISOString() : null,
    pieces: issue.pieces.map((p) => ({
      id: p.id, section: p.section, position: p.position, rawBody: p.rawBody,
      sourceUrl: p.sourceUrl, authorName: p.authorName, status: p.status,
    })),
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Mail size={11} /> Workspace · Marketing</>}
        title="Newsletter"
        description={
          isStaff(role)
            ? "Drop your section's update into the right box — a paragraph, bullets, a forwarded note, whatever you have. When the issue is full, the AI lays it out into the Mailchimp template and you copy the HTML across."
            : "Contribute an update for the next newsletter."
        }
      />
      <NewsletterNav />
      <NewsletterClient initialIssue={initialIssue} canEdit={canEdit} />
    </div>
  );
}
