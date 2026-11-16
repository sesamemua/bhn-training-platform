/**
 * Workspace → Outreach → Campaigns → one campaign. Resolves the chosen email
 * template (with the team's overrides applied) and builds the recipient roster
 * from the target audience, then hands off to the client for live per-contact
 * personalisation, copy / open-in-mail, and reached-tracking.
 */
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CampaignDetailClient, type Recipient,
} from "@/components/workspace/CampaignDetailClient";
import { getOutreachTemplateOverrides, resolveTemplates } from "@/lib/outreach/templates";
import { sanitizeFilter } from "@/lib/outreach/crm";
import { smartListMembers } from "@/lib/outreach/crm-server";

export const dynamic = "force-dynamic";

interface PageProps { params: Promise<{ id: string }> }

const asValues = (v: unknown): Record<string, string> =>
  typeof v === "object" && v !== null ? (v as Record<string, string>) : {};
const asVars = (v: unknown): Record<string, string> => asValues(v);
const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export default async function CampaignDetailPage({ params }: PageProps) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const { id } = await params;

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { id },
    include: { list: { select: { name: true, filter: true } }, sends: { select: { personId: true, openedAt: true, clickedAt: true } } },
  });
  if (!campaign) notFound();

  const overrides = await getOutreachTemplateOverrides();
  const tpls = resolveTemplates(overrides);
  const tpl = tpls.find((t) => t.id === campaign.templateId);
  // Optional second template for contacts who already know us.
  const returning = campaign.returningTemplateId ? tpls.find((t) => t.id === campaign.returningTemplateId) : null;

  // Build the roster from the target audience. needsIntro = no intro on file yet.
  let roster: Recipient[];
  const smart = sanitizeFilter(campaign.list?.filter);
  if (smart) {
    roster = (await smartListMembers(smart)).map((p) => ({
      personId: p.id, name: p.values.name ?? "", org: p.values.org ?? "", email: p.values.email ?? "", needsIntro: !p.introSentAt,
    }));
  } else if (campaign.listId) {
    const memberships = await prisma.outreachMembership.findMany({
      where: { listId: campaign.listId },
      orderBy: { order: "asc" },
      include: { person: { select: { id: true, values: true, introSentAt: true } } },
    });
    roster = memberships.map((m) => {
      const v = asValues(m.person.values);
      return { personId: m.personId, name: v.name ?? "", org: v.org ?? "", email: v.email ?? "", needsIntro: !m.person.introSentAt };
    });
  } else {
    const people = await prisma.outreachPerson.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, values: true, introSentAt: true },
    });
    roster = people.map((p) => {
      const v = asValues(p.values);
      return { personId: p.id, name: v.name ?? "", org: v.org ?? "", email: v.email ?? "", needsIntro: !p.introSentAt };
    });
  }

  const track = new Map(campaign.sends.map((x) => [x.personId, x]));
  roster = roster.map((r) => ({ ...r, opened: Boolean(track.get(r.personId)?.openedAt), clicked: Boolean(track.get(r.personId)?.clickedAt) }));

  const senderName = (session.user as { name?: string }).name ?? "";

  return (
    <CampaignDetailClient
      campaign={{
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        notes: campaign.notes,
        listName: campaign.list?.name ?? null,
        templateId: campaign.templateId,
        templateLabel: tpl?.label ?? campaign.templateId,
        templateSubject: tpl?.subject ?? "",
        templateBody: tpl?.body ?? "",
        returningTemplateLabel: returning?.label ?? null,
        returningTemplateSubject: returning?.subject ?? null,
        returningTemplateBody: returning?.body ?? null,
        vars: asVars(campaign.vars),
      }}
      roster={roster}
      sentPersonIds={asIds(campaign.sentPersonIds)}
      defaultSenderName={senderName}
    />
  );
}
