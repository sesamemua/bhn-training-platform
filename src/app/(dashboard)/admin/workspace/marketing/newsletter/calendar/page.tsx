/**
 * Workspace → Marketing → Newsletter → Calendar.
 *
 * The production schedule: one issue a month landing in the third week,
 * with every deadline worked backwards from the send date, and the
 * reminders that chase each one. Also where the final approval is
 * recorded — the approver sees an Approve control on their own row and
 * nobody else does.
 */
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { NewsletterNav } from "@/components/workspace/NewsletterNav";
import { NewsletterCalendarClient } from "@/components/workspace/NewsletterCalendarClient";
import { effectiveSchedule, listCycles } from "@/lib/newsletter/calendar";
import { getNewsletterConfig, isApprover } from "@/lib/newsletter/config";

export const dynamic = "force-dynamic";

export default async function NewsletterCalendarPage() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect(await deniedRedirect("/admin/workspace/marketing/newsletter/calendar"));

  const user = session.user as { role?: string; email?: string };
  const canEdit = user.role === "admin" || user.role === "superadmin";

  const monthIso = `${new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Toronto" })
    .slice(0, 7)}-01`;

  const [cycles, config] = await Promise.all([listCycles(monthIso), getNewsletterConfig()]);
  // Holidays are computed server-side and handed down, so the lane's drag
  // maths agrees exactly with what the server will accept.
  const holidays = effectiveSchedule(config, monthIso, 24).holidays;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={
          <>
            <Mail size={11} /> Workspace · Marketing
          </>
        }
        title="Newsletter calendar"
        description="One issue a month, landing in the third week. Drag a bar to move an issue; everything else follows."
      />
      <NewsletterNav />
      <NewsletterCalendarClient
        initialCycles={JSON.parse(JSON.stringify(cycles))}
        initialConfig={config}
        holidays={holidays}
        canEdit={canEdit}
        viewerIsApprover={isApprover(config, user.email)}
        coordinatorName={config.coordinator.name}
        approverName={config.approver.name}
      />
    </div>
  );
}
