/**
 * Workspace → Knowledge Exchange → Awardee Intake.
 *
 * What awardees send through the public form, filed by round. The round
 * is the team's: set here, never shown to the awardee.
 *
 * In the Workspace rather than under Administration → Experience, which
 * is left out of the production build while EXPERIENCE is paused.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { deniedRedirect, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { KeAwardeesManager } from "@/components/workspace/KeAwardeesManager";
import { CURRENT_ROUND_KEY, QUOTE_WORDS_KEY, settingsFrom } from "@/lib/knowledge-exchange/intake";

export const dynamic = "force-dynamic";

const HERE = "/admin/workspace/knowledge-exchange";

export default async function KnowledgeExchangeIntakePage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect(await deniedRedirect(HERE));

  // The link on the domain the admin is on, so it is the one awardees can open.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;

  const [rows, settings] = await Promise.all([
    prisma.knowledgeExchangeAwardee.findMany({
      orderBy: [{ round: "desc" }, { createdAt: "asc" }],
      omit: { updatedAt: true },
    }),
    prisma.platformSetting.findMany({ where: { key: { in: [CURRENT_ROUND_KEY, QUOTE_WORDS_KEY] } } }),
  ]);

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow={<><Award size={11} /> Workspace · Knowledge Exchange</>}
        title="Awardee intake"
        description="Send awardees one link and they fill in their project, institutions, a photo, a quote and their LinkedIn — no account needed. Submissions are filed by round; the round is only visible here."
      />
      <div className="mx-auto max-w-4xl space-y-6 pb-12">
        <KeAwardeesManager
          link={`${origin}/knowledge-exchange/awardee`}
          settings={settingsFrom(settings)}
          awardees={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        />
      </div>
    </>
  );
}
