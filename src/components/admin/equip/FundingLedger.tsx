import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import {
  VC_DOLLAR_CAP, VC_APPLICATION_CAP, varianceOf,
  type CapState, type Variance, type PriorAward,
} from "@/lib/equip/cap";

/**
 * One applicant's whole VentureConnect position, on the page where a
 * reviewer decides.
 *
 * Three things it has to answer without anybody opening another tab:
 *   • how much of the $5,000 is left
 *   • how many of the three slots are gone
 *   • for each earlier award — asked, granted, and what was actually
 *     spent, with both gaps
 *
 * The two gaps are kept apart on purpose. requested → approved is a
 * review decision; approved → actual is an outcome. Rolling them into
 * one "variance" column would hide which of the two is happening, and
 * they call for completely different responses.
 */
const cad = (n: number) => `$${n.toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

export function FundingLedger({
  state, total, current, currentId,
}: {
  state: CapState;
  total: Variance;
  /** The application being reviewed, so it appears in its own ledger. */
  current: { id: string; status: string; requestedAmount: number | null; approvedAmount: number | null; actualAmount: number | null; decidedAt: Date | null };
  currentId: string;
}) {
  const rows: (PriorAward & { isCurrent?: boolean })[] = [
    ...state.prior,
    { ...current, isCurrent: true },
  ].sort((a, b) => (a.decidedAt?.getTime() ?? Infinity) - (b.decidedAt?.getTime() ?? Infinity));

  const overCap = state.approvedToDate > VC_DOLLAR_CAP;
  const overSlots = state.slotsUsed > VC_APPLICATION_CAP;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 surface-shadow">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
        VentureConnect position · this applicant
      </p>

      {/* ── The two limits, side by side. Both must have room. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Limit
          label="Funding used"
          used={cad(state.approvedToDate)}
          of={cad(VC_DOLLAR_CAP)}
          left={`${cad(state.dollarsLeft)} left`}
          pct={Math.min(1, state.approvedToDate / VC_DOLLAR_CAP)}
          blocked={state.atDollarCap}
          over={overCap}
        />
        <Limit
          label="Applications funded"
          used={String(state.slotsUsed)}
          of={String(VC_APPLICATION_CAP)}
          left={`${state.slotsLeft} left`}
          pct={Math.min(1, state.slotsUsed / VC_APPLICATION_CAP)}
          blocked={state.atApplicationCap}
          over={overSlots}
        />
      </div>

      {(state.atApplicationCap || state.atDollarCap) && (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-700 ring-1 ring-inset ring-amber-500/25">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            {state.atApplicationCap
              ? `All ${VC_APPLICATION_CAP} funded applications are used. A further approval is refused regardless of amount.`
              : `The full ${cad(VC_DOLLAR_CAP)} is committed. A further approval is refused regardless of remaining slots.`}
          </span>
        </p>
      )}

      {/* ── Asked, granted, spent — per application and in total. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[38rem] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[9.5px] uppercase tracking-wider text-subtle">
              <th className="py-1.5 pr-2 font-bold">Decided</th>
              <th className="py-1.5 pr-2 font-bold">Status</th>
              <th className="py-1.5 px-2 text-right font-bold">Requested</th>
              <th className="py-1.5 px-2 text-right font-bold">Approved</th>
              <th className="py-1.5 px-2 text-right font-bold">Δ review</th>
              <th className="py-1.5 px-2 text-right font-bold">Actual</th>
              <th className="py-1.5 pl-2 text-right font-bold">Δ spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = varianceOf(r);
              const isCurrent = r.id === currentId;
              return (
                <tr key={r.id} className={"border-b border-line/50 " + (isCurrent ? "bg-accent/[0.06]" : "")}>
                  <td className="py-1.5 pr-2 font-mono text-[10px] text-subtle">
                    {r.decidedAt ? r.decidedAt.toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="py-1.5 pr-2">
                    {isCurrent ? (
                      <span className="font-semibold text-accent">this one</span>
                    ) : (
                      <Link href={`/admin/equip/${r.id}`} className="text-muted hover:text-fg hover:underline">
                        {r.status}
                      </Link>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted">
                    {v.requested != null ? cad(v.requested) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-fg">
                    {v.approved != null ? cad(v.approved) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums"><Delta n={v.reviewDelta} /></td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {v.actual != null
                      ? <span className="font-semibold text-fg">{cad(v.actual)}</span>
                      : <span className="text-[10px] italic text-subtle">not reconciled</span>}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums"><Delta n={v.spendDelta} /></td>
                </tr>
              );
            })}
            <tr className="text-[11.5px] font-bold">
              <td className="py-2 pr-2 text-subtle" colSpan={2}>Total</td>
              <td className="py-2 px-2 text-right tabular-nums text-muted">
                {total.requested != null ? cad(total.requested) : "—"}
              </td>
              <td className="py-2 px-2 text-right tabular-nums text-fg">
                {total.approved != null ? cad(total.approved) : "—"}
              </td>
              <td className="py-2 px-2 text-right tabular-nums"><Delta n={total.reviewDelta} /></td>
              <td className="py-2 px-2 text-right tabular-nums text-fg">
                {total.actual != null ? cad(total.actual) : "—"}
              </td>
              <td className="py-2 pl-2 text-right tabular-nums"><Delta n={total.spendDelta} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-subtle">
        <strong className="text-muted">Δ review</strong> is what the committee trimmed off the request.{" "}
        <strong className="text-muted">Δ spend</strong> is what came back unspent against what was granted, and
        appears only once an actual figure has been entered — a blank is &ldquo;not checked&rdquo;, not
        &ldquo;spent to the dollar&rdquo;.{" "}
        {state.reconciledCount < state.slotsUsed && (
          <>
            {state.slotsUsed - state.reconciledCount} of {state.slotsUsed} earlier award
            {state.slotsUsed === 1 ? " is" : "s are"} still unreconciled.{" "}
          </>
        )}
        Headroom is measured against <strong className="text-muted">approved</strong>, so money that came back
        unspent does not reopen the cap.
      </p>

      {/* The one thing a reviewer must not assume this page has checked. */}
      <p className="mt-2 flex items-start gap-1.5 border-t border-line pt-2 text-[10.5px] leading-relaxed text-subtle">
        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
        <span>
          Both limits are worded to applicants as <strong className="text-muted">per company</strong>, but are
          enforced here <strong className="text-muted">per person</strong> — by account, or by the address a
          public applicant used. Two founders of the same company hold {cad(VC_DOLLAR_CAP)} and{" "}
          {VC_APPLICATION_CAP} slots each. Check the company name on any other open application before approving.
        </span>
      </p>
    </section>
  );
}

function Limit({
  label, used, of, left, pct, blocked, over,
}: {
  label: string; used: string; of: string; left: string;
  pct: number; blocked: boolean; over: boolean;
}) {
  return (
    <div className="rounded-xl bg-elevated/40 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">{label}</p>
        <p className={"text-[11px] font-semibold tabular-nums " + (blocked ? "text-rose-500" : "text-emerald-600")}>
          {blocked ? "none left" : left}
        </p>
      </div>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-fg">
        {used} <span className="text-[12px] font-medium text-subtle">of {of}</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={"h-full rounded-full " + (over ? "bg-rose-500" : blocked ? "bg-amber-500" : "bg-accent")}
          style={{ width: `${Math.max(2, pct * 100)}%` }}
        />
      </div>
      {over && (
        <p className="mt-1 text-[10px] font-semibold text-rose-500">
          Over the limit — this predates the rule being enforced.
        </p>
      )}
    </div>
  );
}

function Delta({ n }: { n: number | null }) {
  if (n == null) return <span className="text-subtle">—</span>;
  if (n === 0) return <span className="inline-flex items-center gap-0.5 text-emerald-600"><Check size={10} />0</span>;
  return (
    <span className={n < 0 ? "text-emerald-600" : "text-amber-600"}>
      {n < 0 ? "−" : "+"}{cad(Math.abs(n))}
    </span>
  );
}
