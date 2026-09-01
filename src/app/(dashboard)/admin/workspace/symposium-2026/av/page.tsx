/**
 * Workspace → 2026 Symposium → AV.
 *
 * Three Livecast documents side by side: last year's quote, what last
 * year actually cost, and this year's quote. The page exists to answer
 * one question — is the 2026 number reasonable — and the honest answer
 * needs all three, because 2025 was billed 12% above its own quote.
 *
 * Static: the figures live in src/lib/symposium/av.ts, transcribed from
 * the PDFs and reconciled against each document's own stated totals by
 * tests/unit/symposium-av.test.ts.
 */
import { redirect } from "next/navigation";
import { Speaker } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { AvComparison } from "@/components/workspace/AvComparison";
import { AV_DELTAS } from "@/lib/symposium/av";

export const dynamic = "force-dynamic";

const cad = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

export default async function SymposiumAvPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · 2026 Symposium"
        title="AV"
        description={`Livecast's 2026 quote against last year's quote and last year's final invoice, line by line. The invoice is in there because 2025 was billed ${cad(AV_DELTAS.overrun2025.amount)} above its own quote — the 2025 estimate is not what the 2025 Symposium cost.`}
        icon={<Speaker />}
      />
      <AvComparison />
    </>
  );
}
