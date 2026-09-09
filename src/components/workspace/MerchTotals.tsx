"use client";
/**
 * What the selected merch would cost, as a range.
 *
 * A single number here would be a lie. The supplier publishes unit
 * pricing and setup charges, and does not publish shipping ("billed at
 * actual cost") or what exchange, brokerage and duty add to US-sourced
 * goods. So the estimate shows what is known, states what is assumed,
 * and puts the gap between those assumptions on screen as the range.
 *
 * Quantities are per item, not one number for the whole order: the price
 * breaks sit at different quantities on every listing, so 300 of one
 * thing and 1,000 of another is a normal order, not an edge case.
 *
 * All the arithmetic is in src/lib/merch/filter.ts — this only draws it.
 */
import { Copy, Check, Info } from "lucide-react";
import {
  DEFAULT_ASSUMPTIONS, estimateOrder, formatCad, qtyFor,
  type OrderAssumptions,
} from "@/lib/merch/filter";
import { MERCH, type MerchItem } from "@/lib/merch/types";

export function MerchTotals({
  chosen, qtyByItem, onQty, assumptions, onAssumptions, onCopyQuote, copied, onClear,
}: {
  chosen: MerchItem[];
  qtyByItem: Record<string, number>;
  onQty: (itemId: string, qty: number) => void;
  assumptions: OrderAssumptions;
  onAssumptions: (next: OrderAssumptions) => void;
  onCopyQuote: () => void;
  copied: boolean;
  onClear: () => void;
}) {
  const order = estimateOrder(chosen, qtyByItem, MERCH.meta, assumptions);
  const num =
    "w-24 rounded-lg border border-brand-300 bg-card px-2 py-1 text-right text-xs tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/40";

  return (
    <section className="space-y-3 rounded-2xl border border-brand-300 bg-brand-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">Estimated order</p>
          <p className="font-mono text-2xl font-bold tabular-nums text-brand-900">
            {formatCad(order.low)} <span className="font-sans text-base font-semibold text-brand-700">–</span>{" "}
            {formatCad(order.high)}
          </p>
          <p className="text-[11px] text-brand-800">
            {order.count} item{order.count === 1 ? "" : "s"} · {order.units.toLocaleString("en-CA")} units ·{" "}
            {formatCad(order.knownCad)} of it published by {MERCH.meta.supplier}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopyQuote}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy quote request"}
          </button>
          <button onClick={onClear} className="text-[11px] font-semibold text-brand-800 hover:underline">
            Clear
          </button>
        </div>
      </div>

      {/* ── Per-item quantities ─────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-brand-200 bg-card">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="border-b border-line text-[10px] uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-3 py-2 font-bold">Item</th>
              <th className="px-3 py-2 text-right font-bold">Qty</th>
              <th className="px-3 py-2 text-right font-bold">Each</th>
              <th className="px-3 py-2 text-right font-bold">Units</th>
              <th className="px-3 py-2 text-right font-bold">+ decoration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {order.lines.map((l) => (
              <tr key={l.item.id}>
                <td className="px-3 py-2">
                  <span className="font-semibold text-fg">{l.item.name}</span>
                  {l.nextBreak && l.nextBreak.unitCad < l.unitCad && (
                    <span className="ml-1.5 text-[10.5px] font-medium text-emerald-700">
                      {l.nextBreak.minQty.toLocaleString("en-CA")} → ${l.nextBreak.unitCad.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={qtyFor(qtyByItem, l.item, MERCH.meta.quantityBasis)}
                    onChange={(e) => onQty(l.item.id, Math.max(1, Number(e.target.value) || 1))}
                    aria-label={`Quantity for ${l.item.name}`}
                    className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">${l.unitCad.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-fg">{formatCad(l.unitsCad)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                  {formatCad(l.decorationCad)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Where the range comes from ──────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <dl className="space-y-1 rounded-xl border border-brand-200 bg-card px-3 py-2.5 text-[11.5px]">
          {[
            ["Goods", formatCad(order.goodsCad)],
            ["Decoration setup", formatCad(order.decorationCad)],
            [
              assumptions.setupPerItem ? `Order setup (× ${order.count})` : "Order setup (once)",
              formatCad(order.setupCad),
            ],
            ["Shipping", `${formatCad(order.shippingLowCad)} – ${formatCad(order.shippingHighCad)}`],
            [`Exchange, brokerage & duty (${assumptions.dutyPct}%)`, `$0 – ${formatCad(order.dutyCad)}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="font-mono tabular-nums text-fg">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-line pt-1 font-bold">
            <dt className="text-fg">Total</dt>
            <dd className="font-mono tabular-nums text-fg">
              {formatCad(order.low)} – {formatCad(order.high)}
            </dd>
          </div>
        </dl>

        <div className="space-y-2 rounded-xl border border-dashed border-brand-300 bg-card px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            <Info size={11} className="mr-1 inline align-[-2px]" />
            Your assumptions — nobody has quoted these
          </p>
          <label className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
            Shipping, best case
            <input
              type="number" min={0} max={100000} className={num}
              value={assumptions.shippingLowCad}
              onChange={(e) => onAssumptions({ ...assumptions, shippingLowCad: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
            Shipping, worst case
            <input
              type="number" min={0} max={100000} className={num}
              value={assumptions.shippingHighCad}
              onChange={(e) => onAssumptions({ ...assumptions, shippingHighCad: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[11.5px] text-muted">
            Exchange, brokerage &amp; duty %
            <input
              type="number" min={0} max={100} className={num}
              value={assumptions.dutyPct}
              onChange={(e) => onAssumptions({ ...assumptions, dutyPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </label>
          <label className="flex items-center gap-2 text-[11.5px] text-muted">
            <input
              type="checkbox"
              checked={assumptions.setupPerItem}
              onChange={(e) => onAssumptions({ ...assumptions, setupPerItem: e.target.checked })}
              className="rounded border-line"
            />
            {formatCad(MERCH.meta.setupFeeCad)} setup is charged per item, not once
          </label>
          <button
            onClick={() => onAssumptions(DEFAULT_ASSUMPTIONS)}
            className="text-[11px] font-semibold text-brand-700 hover:underline"
          >
            Reset assumptions
          </button>
        </div>
      </div>
    </section>
  );
}
