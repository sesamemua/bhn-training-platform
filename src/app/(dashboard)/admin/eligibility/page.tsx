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
import { platformApplicantCount, rosterState } from "@/lib/eligibility/check";
import { eligibilityGate } from "@/lib/eligibility/gate";
import { ELIGIBILITY_SOURCES } from "@/lib/eligibility/sources";
import { autoRefreshes } from "@/lib/eligibility/apply";

export const dynamic = "force-dynamic";

export default async function EligibilityPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const state = await rosterState();
  const [applicants, perSource, imports] = await Promise.all([
    platformApplicantCount(),
    prisma.eligibilityEntry.groupBy({ by: ["sourceId"], _count: { _all: true } }),
    prisma.eligibilityImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, sourceId: true, method: true, rowsRead: true, rowsAccepted: true,
        rowsSkipped: true, addedEmails: true, removedEmails: true,
        error: true, createdAt: true,
      },
    }),
  ]);
  const counts = Object.fromEntries(perSource.map((r) => [r.sourceId, r._count._all]));

  const initial: EligibilityState = {
    gate: eligibilityGate(state, new Date()),
    total: state.total,
    sources: ELIGIBILITY_SOURCES.map((s) => ({
      id: s.id, name: s.name, note: s.note, url: s.url, access: s.access,
      programmes: [...s.programmes],
      // The live list is counted where it lives, not in the entries table.
      count: s.access === "platform" ? applicants : counts[s.id] ?? 0,
      // Whether anybody still has to remember to re-paste this one.
      auto: autoRefreshes(s.id),
    })),
    imports: imports.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
  };

  return (
    <div className="space-y-6">
      <DSPageHeader
        eyebrow={<><ShieldCheck size={11} /> Admin · Eligibility</>}
        title="Eligibility lists"
        description="Who is allowed to register for Training Week. Registration checks the address somebody types against these lists the moment they enter it. Nobody is turned away any more — an address on no list can still register, and is flagged here for a coordinator to settle. The ENGAGE and EXPERIENCE sheet is re-read every night; the EQUIP workbooks are still pasted in."
      />
      <EligibilityManager initial={initial} />
    </div>
  );
}
