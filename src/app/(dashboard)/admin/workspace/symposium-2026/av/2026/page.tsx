/**
 * Workspace → 2026 Symposium → AV 2026.
 *
 * The two quotes Livecast sent on 8 September 2026, which replaced the
 * single quote the 2025 comparison page argues against. Kept as its own
 * page rather than a fourth column over there: that page is an argument
 * about whether this year's number is reasonable, and this one is about
 * what changed when one quote became two.
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
import { AV26_VS_SUPERSEDED } from "@/lib/symposium/av-2026";

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
        title="The September quotes"
        description={`Livecast re-issued the Symposium AV as two documents on 8 September — the room and the stream, quoted separately. Together they come to ${cad(AV26_VS_SUPERSEDED.difference)} more than the single quote they replace, and the kit did not change.`}
        icon={<Speaker />}
      />
      <div className="@container mt-6">
        <Av2026Quotes />
      </div>
    </>
  );
}
