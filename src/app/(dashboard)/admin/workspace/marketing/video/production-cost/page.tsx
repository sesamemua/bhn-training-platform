/**
 * Workspace → Video Production → Production cost. The BHN Promo Video
 * shoot budget: vendor quotes, the lens swap, parking, insurance and
 * catering estimates, and one total. Read-only; the figures live in
 * src/lib/video/production-cost.ts.
 */
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { VideoNav } from "@/components/workspace/VideoNav";
import { COST_GROUPS, cad, groupTotal, subtotal, totals } from "@/lib/video/production-cost";

export const dynamic = "force-dynamic";

export default async function ProductionCostPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const t = totals();

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Receipt size={11} /> Workspace · Marketing</>}
        title="Production cost"
        description="BHN Promo Video — shoot on Tuesday 6 October 2026. Camera and lens are picked up Monday 5 October and returned Wednesday 7 October."
      />
      <VideoNav />

      {/* A budget reads down a column: keep label and amount within one
          eye-span rather than at opposite edges of a wide screen. */}
      <div className="max-w-3xl space-y-6">
      <section aria-label="Totals" className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total, taxes in", value: t.total, strong: true },
          { label: "Before tax", value: t.pre },
          { label: "Taxes", value: t.tax },
          { label: "Of which estimated", value: t.estimated },
        ].map((s) => (
          <div key={s.label} className="bg-card-solid px-4 py-3">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">{s.label}</div>
            <div className={`mt-1 font-mono tabular-nums ${s.strong ? "text-2xl font-bold text-fg" : "text-lg font-semibold text-fg"}`}>
              {cad(s.value)}
            </div>
          </div>
        ))}
      </section>

      <div className="space-y-4">
        {COST_GROUPS.map((g) => (
          <section key={g.key} aria-labelledby={`cost-${g.key}`} className="overflow-hidden rounded-xl border border-line bg-card-solid">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
              <div>
                <h2 id={`cost-${g.key}`} className="text-[15px] font-bold text-fg">{g.title}</h2>
                <p className="text-[12px] text-muted">
                  {g.vendor} · {g.source}
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    g.basis === "quote" ? "bg-emerald-500/12 text-emerald-700" : "bg-amber-500/15 text-amber-700"
                  }`}>
                    {g.basis === "quote" ? "Quoted" : "Estimate"}
                  </span>
                </p>
              </div>
              <div className="font-mono text-lg font-bold tabular-nums text-fg">{cad(groupTotal(g))}</div>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.label} className={`border-b border-line/70 ${l.removed ? "text-subtle" : "text-fg"}`}>
                      <td className="px-4 py-2">
                        <span className={l.removed ? "line-through" : undefined}>{l.label}</span>
                        {l.removed && <span className="ml-2 rounded bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">Removed</span>}
                        {l.note && <span className="block text-[11.5px] text-muted">{l.note}</span>}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums ${l.removed ? "line-through" : ""}`}>
                        {cad(l.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-line/70 text-muted">
                    <td className="px-4 py-1.5 text-[12px]">Subtotal</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{cad(subtotal(g))}</td>
                  </tr>
                  <tr className="text-muted">
                    <td className="px-4 py-1.5 text-[12px]">{g.taxLabel}</td>
                    <td className="px-4 py-1.5 text-right font-mono tabular-nums">{cad(g.tax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ul className="space-y-1 border-t border-line bg-elevated/40 px-4 py-3 text-[12px] leading-relaxed text-muted">
              {g.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </section>
        ))}
      </div>

      <section aria-label="Grand total" className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border-2 border-brand-500/40 bg-card-solid px-4 py-3">
        <div>
          <div className="text-[15px] font-bold text-fg">Total production cost</div>
          <div className="text-[12px] text-muted">
            {cad(t.quoted)} quoted by vendors + {cad(t.estimated)} estimated (parking, catering). Taxes included.
          </div>
        </div>
        <div className="font-mono text-2xl font-bold tabular-nums text-fg">{cad(t.total)}</div>
      </section>
      </div>
    </div>
  );
}
