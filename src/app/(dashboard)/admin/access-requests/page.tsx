import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Inbox } from "lucide-react";
import { PageHero } from "@/components/ui/PageHero";
import { AccessRequestsClient } from "@/components/admin/AccessRequestsClient";
import { isRegistrationOpen } from "@/lib/auth/registration";
import { baseUrl } from "@/lib/notify/email";

export const dynamic = "force-dynamic";

export default async function AccessRequestsPage() {
  await requireRole("admin");

  const requests = await prisma.accessRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  // While sign-up is closed a trainee's account is made by hand, so the
  // list needs to know which requests already have one (read-only).
  const registrationOpen = isRegistrationOpen();
  const traineeEmails = registrationOpen
    ? []
    : [...new Set(requests.filter((r) => r.kind !== "employer").flatMap((r) => [r.email, r.email.trim().toLowerCase()]))];
  const withAccount = new Set(
    traineeEmails.length
      ? (await prisma.user.findMany({ where: { email: { in: traineeEmails } }, select: { email: true } }))
          .map((u) => u.email.trim().toLowerCase())
      : [],
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Inbox size={11} /> Admin · Platform</>}
        title="Access requests"
        description="Submissions from the public /for-employers and /for-trainees pages. Approve to mint an invite, or reject if it's not a fit."
      />

      <AccessRequestsClient
        registrationOpen={registrationOpen}
        siteUrl={baseUrl()}
        initial={requests.map((r) => ({
          id: r.id,
          kind: r.kind,
          email: r.email,
          name: r.name,
          company: r.company,
          website: r.website,
          message: r.message,
          source: r.source,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          hasAccount: withAccount.has(r.email.trim().toLowerCase()),
        }))}
      />
    </div>
  );
}
