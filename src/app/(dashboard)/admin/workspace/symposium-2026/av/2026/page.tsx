/**
 * Workspace → 2026 Symposium → AV 2026.
 *
 * The Symposium AV quote as it stands — round 3, #231816038 v2 — laid out
 * for the one decision it leaves: the room alone, or with a stream. The
 * split pair it replaced sits below, collapsed. Kept as its own page
 * rather than a column on the 2025 comparison: that page argues about
 * whether this year's number is reasonable, this one is what to sign.
 *
 * Static: the figures live in src/lib/symposium/av-2026.ts, transcribed
 * from the PDFs and reconciled against each document's own stated
 * totals by tests/unit/symposium-av-2026.test.ts.
 */
import { redirect } from "next/navigation";
import { Speaker } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { Av2026Quotes } from "@/components/workspace/Av2026Quotes";
import { AV26_DECISION } from "@/lib/symposium/av-2026";

export const dynamic = "force-dynamic";

const cad = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });

export default async function SymposiumAv2026Page() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · 2026 Symposium · AV"
        title="The AV quote — round 3"
        description={`Livecast's latest: the room and the stream back in one quote. The room alone is ${cad(AV26_DECISION.roomOnly.total)}; the stream adds ${cad(AV26_DECISION.streaming.total)}, for ${cad(AV26_DECISION.withStream.total)} in total — back on the 1 September price.`}
        icon={<Speaker />}
      />
      <div className="@container mt-6">
        <Av2026Quotes />
      </div>
    </>
  );
}
