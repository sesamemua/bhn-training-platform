/**
 * Admin → Eligibility lists.
 *
 * The screen the eligibility feature was missing: the API to import the
 * programme lists existed, nothing called it, so the check could never
 * be switched on from the platform.
 *
 * The first read happens here rather than in the client on mount — the
 * page already runs on the server with the admin session, so fetching
 * it again from the browser would only add a round trip and a spinner.
 * The client re-reads after an import, which is an event, not a render.
 */
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { EligibilityManager, type EligibilityState } from "@/components/admin/eligibility/EligibilityManager";
import { rosterState } from "@/lib/eligibility/check";
import { eligibilityGate } from "@/lib/eligibility/gate";
import { ELIGIBILITY_SOURCES } from "@/lib/eligibility/sources";

export const dynamic = "force-dynamic";

export default async function EligibilityPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const state = await rosterState();
  const [perSource, imports] = await Promise.all([
    prisma.eligibilityEntry.groupBy({ by: ["sourceId"], _count: { _all: true } }),
    prisma.eligibilityImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, sourceId: true, rowsRead: true, rowsAccepted: true,
        rowsSkipped: true, error: true, createdAt: true,
      },
    }),
  ]);
  const counts = Object.fromEntries(perSource.map((r) => [r.sourceId, r._count._all]));

  const initial: EligibilityState = {
    gate: eligibilityGate(state, new Date()),
    total: state.total,
    sources: ELIGIBILITY_SOURCES.map((s) => ({
      id: s.id, name: s.name, note: s.note, url: s.url,
      programmes: [...s.programmes], count: counts[s.id] ?? 0,
    })),
    imports: imports.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  };

  return (
    <div className="space-y-6">
      <DSPageHeader
        eyebrow={<><ShieldCheck size={11} /> Admin · Eligibility</>}
        title="Eligibility lists"
        description="Who is allowed to register for Training Week. Registration checks the address somebody types against these lists the moment they enter it — and refuses anyone who is not on one. With no list loaded nothing is enforced and everybody gets in, so import before registration opens."
      />
      <EligibilityManager initial={initial} />
    </div>
  );
}
