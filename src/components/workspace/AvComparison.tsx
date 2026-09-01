"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import {
  AV_LINES, AV_DOCS, AV_DELTAS, AV_TERM_CHANGES, AV_GROUP_LABELS, AV_SOURCE_FOLDER,
  amountOn, lineDelta, netOn, netDelta, discountOf, discountRate,
  type AvGroup, type AvLine, type AvDoc,
} from "@/lib/symposium/av";
import { cn } from "@/lib/utils";

const cad = (n: number, dp = 2) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
const pct0 = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Column order is chronological, which is also the order of the argument. */
const COLS = [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026] as const;

const GROUP_ORDER: AvGroup[] = ["streaming", "audio", "video", "lighting", "staging", "labour", "other"];

export function AvComparison() {
  const [only, setOnly] = useState<"all" | "changed" | "new">("all");
  const [basis, setBasis] = useState<"net" | "list">("net");

  const grouped = useMemo(() => {
    const delta = basis === "net" ? netDelta : lineDelta;
    const pass = (l: AvLine) => {
      if (only === "new") return !!l.q2026 && !l.q2025 && !l.i2025;
      if (only === "changed") return delta(l) !== 0;
      return true;
    };
    return GROUP_ORDER
      .map((g) => ({ group: g, lines: AV_LINES.filter((l) => l.group === g && pass(l)) }))
      .filter((s) => s.lines.length > 0);
  }, [only, basis]);

  const shown = grouped.reduce((n, s) => n + s.lines.length, 0);

  return (
    <div className="space-y-6">
      {/* ── One headline: how far last year drifted after its quote was
             signed. Kept because it is the fact that makes the rest of the
             page readable — the 2025 column is not what 2025 cost. */}
      <div className="sm:max-w-sm">
        <Headline
          label="2025 quote vs 2025 actual"
          value={cad(AV_DELTAS.overrun2025.amount, 2)}
          sub={`${pct(AV_DELTAS.overrun2025.pct)} over quote · ${cad(AV_DOCS.q2025.total)} → ${cad(AV_DOCS.i2025.total)}`}
          tone="warn"
          hint="How far last year drifted after the quote was signed."
        />
      </div>

      {/* ── Document headers */}
      <div className="grid gap-3 sm:grid-cols-3">
        {COLS.map((d) => (
          <div
            key={d.key}
            className={cn(
              "rounded-xl border p-3.5",
              d.key === "q2026" ? "border-accent/40 bg-accent/[0.04]" : "border-line bg-card",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12.5px] font-bold text-fg">{d.title}</p>
              <span className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                d.kind === "invoice" ? "bg-amber-500/15 text-amber-600" : "bg-elevated text-subtle",
              )}>
                {d.kind}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-subtle">{d.ref} · {d.dated}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-fg">{cad(d.total)}</p>
            <dl className="mt-2 space-y-0.5 text-[11px] text-muted">
              <Row k="Line items" v={cad(d.gross)} />
              {d.discounts.map((x) => <Row key={x.label} k={x.label} v={cad(x.amount)} muted />)}
              <Row k={`Discount total (${pct0(discountRate(d))})`} v={`−${cad(discountOf(d))}`} />
              <Row k="Subtotal" v={cad(d.subtotal)} />
              <Row k="HST" v={cad(d.tax)} />
            </dl>
            <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-subtle">
              <strong className="text-muted">Event</strong> {d.eventDate}<br />
              <strong className="text-muted">Venue</strong> {d.venue}<br />
              <strong className="text-muted">Payment</strong> {d.paymentDue}
            </p>
          </div>
        ))}
      </div>

      {/* ── Why the table has two bases. The list amounts on all three
             documents are before discount, and the discount is not the
             same size year to year — it deepens from 12.7% to 27.5%.
             Comparing lists says the AV bill is up 41.6%. It is up 31.2%. */}
      <div className="rounded-xl border border-line bg-card p-3.5">
        <p className="text-[12.5px] font-bold text-fg">The discount is doing real work</p>
        <p className="mt-1 max-w-prose text-[11.5px] leading-relaxed text-muted">
          Every line below is a <strong className="text-fg">list</strong> amount — each document
          then takes a lump off the bottom, and the lump has grown:{" "}
          {[AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026]
            .map((d) => `${pct0(discountRate(d))} in ${d.key === "q2026" ? "2026" : d.key === "i2025" ? "2025 actual" : "2025 quoted"}`)
            .join(", ")}
          . So the two views disagree, and the difference is not small:
        </p>
        <div className="mt-2.5 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">List amounts</p>
            <p className="text-lg font-bold tabular-nums text-rose-500">{pct(AV_DELTAS.listRise)}</p>
            <p className="text-[11px] tabular-nums text-subtle">
              {cad(AV_DOCS.i2025.gross, 0)} → {cad(AV_DOCS.q2026.gross, 0)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">What BHN actually pays</p>
            <p className="text-lg font-bold tabular-nums text-amber-600">{pct(AV_DELTAS.payableRise)}</p>
            <p className="text-[11px] tabular-nums text-subtle">
              {cad(AV_DOCS.i2025.subtotal, 0)} → {cad(AV_DOCS.q2026.subtotal, 0)} before tax
            </p>
          </div>
        </div>
        <p className="mt-2.5 max-w-prose text-[11px] leading-relaxed text-subtle">
          The table defaults to <strong className="text-muted">after discount</strong>, which
          spreads each document&apos;s discount across its lines in proportion to their size.
          That is an apportionment, not what Livecast did line by line — two of the reductions
          are plainly item-specific (a $180 &ldquo;50% off&rdquo; on both 2025 documents, and an
          $810 100% item discount on the invoice), and the documents do not say which lines they
          applied to. Each document&apos;s own total is exact; the per-line net figures are
          indicative. Switch to <strong className="text-muted">list</strong> to see the printed
          numbers.
        </p>
      </div>

      {/* ── The line-by-line table */}
      <div className="rounded-2xl border border-line bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-bold text-fg">Line by line</h2>
          <span className="text-[11px] text-subtle">{shown} of {AV_LINES.length}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <div className="mr-2 flex gap-1 rounded-lg bg-elevated p-0.5">
              {([["net", "After discount"], ["list", "List"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setBasis(k)}
                  className={cn(
                    "rounded-[6px] px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    basis === k ? "bg-card text-fg shadow-sm" : "text-subtle hover:text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {([["all", "All"], ["changed", "Changed only"], ["new", "New in 2026"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setOnly(k)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  only === k ? "bg-accent text-white" : "bg-elevated text-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-subtle">
                <th className="px-4 py-2 font-bold">Item</th>
                {COLS.map((d) => (
                  <th key={d.key} className="px-3 py-2 text-right font-bold">
                    {d.key === "q2025" ? "2025 quote" : d.key === "i2025" ? "2025 actual" : "2026 quote"}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-bold">vs 2025 actual</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ group, lines }) => (
                <GroupRows key={group} group={group} lines={lines} basis={basis} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Terms. The differences that never show up in a price comparison
             and are the ones that cost money after the fact. */}
      <div className="rounded-2xl border border-line bg-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-bold text-fg">Everything that changed that is not a price</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Read this before the table above. One of these commits BHN to spending that is
            not in the quote at all, and one is a contradiction on the face of the document.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {AV_TERM_CHANGES.map((t) => (
            <li key={t.label} className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_1fr_1fr]">
              <div className="flex items-start gap-1.5">
                <ImpactDot impact={t.impact} />
                <span className="text-[12px] font-bold leading-snug text-fg">{t.label}</span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-subtle">
                <span className="mr-1 text-[9px] font-bold uppercase tracking-wider">2025</span>
                {t.y2025}
              </p>
              <p className={cn(
                "text-[11.5px] leading-relaxed",
                t.impact === "cost" || t.impact === "risk" ? "text-fg" : "text-muted",
              )}>
                <span className="mr-1 text-[9px] font-bold uppercase tracking-wider text-subtle">2026</span>
                {t.y2026}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] leading-relaxed text-subtle">
        Transcribed from the three Livecast PDFs in <code className="rounded bg-elevated px-1 py-0.5">{AV_SOURCE_FOLDER}</code>.
        Every figure is checked against each document&apos;s own stated subtotal, discount and
        total, so a mistyped line item fails the build rather than showing a wrong difference here.
      </p>
    </div>
  );
}

function GroupRows({
  group, lines, basis,
}: { group: AvGroup; lines: AvLine[]; basis: "net" | "list" }) {
  const valueOf = (l: AvLine, k: AvDoc["key"]) =>
    basis === "net" ? netOn(l, k) : amountOn(l, k);
  const deltaOf = (l: AvLine) => (basis === "net" ? netDelta(l) : lineDelta(l));
  const subtotal = (k: AvDoc["key"]) => lines.reduce((n, l) => n + valueOf(l, k), 0);

  return (
    <>
      <tr className="bg-elevated/60">
        <td colSpan={5} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
          {AV_GROUP_LABELS[group]}
        </td>
      </tr>
      {lines.map((l) => (
        <tr key={l.key} className="border-b border-line/60 align-top last:border-0">
          <td className="px-4 py-2.5">
            <p className="font-semibold text-fg">{l.label}</p>
            {l.note && <p className="mt-0.5 max-w-prose text-[11px] leading-relaxed text-muted">{l.note}</p>}
          </td>
          {COLS.map((doc) => {
            const e = l[doc.key];
            return (
              <td key={doc.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {e ? (
                  <>
                    <span className={cn("font-semibold", doc.key === "q2026" ? "text-fg" : "text-muted")}>
                      {cad(valueOf(l, doc.key), 0)}
                    </span>
                    {/* In the net view the printed number is shown underneath,
                        so the row can still be checked against the PDF. */}
                    {basis === "net" && e.total > 0 ? (
                      <span className="block text-[10px] text-subtle">{cad(e.total, 0)} list</span>
                    ) : e.qty > 1 ? (
                      <span className="block text-[10px] text-subtle">{e.qty} × {cad(e.unit, 0)}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </td>
            );
          })}
          <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
            <Delta n={deltaOf(l)} />
          </td>
        </tr>
      ))}
      <tr className="border-b border-line bg-elevated/30 text-[11px] font-bold">
        <td className="px-4 py-1.5 text-subtle">Subtotal</td>
        {COLS.map((doc) => (
          <td key={doc.key} className="px-3 py-1.5 text-right tabular-nums text-muted">
            {cad(subtotal(doc.key), 0)}
          </td>
        ))}
        <td className="px-4 py-1.5 text-right tabular-nums">
          <Delta n={subtotal("q2026") - subtotal("i2025")} />
        </td>
      </tr>
    </>
  );
}

function Delta({ n }: { n: number }) {
  if (n === 0) return <span className="text-subtle"><Minus size={11} className="inline" /></span>;
  const up = n > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-rose-500" : "text-emerald-500")}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {cad(Math.abs(n), 0)}
    </span>
  );
}

function Headline({
  label, value, sub, tone, hint,
}: { label: string; value: string; sub: string; tone: "up" | "warn"; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3.5">
      <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "up" ? "text-rose-500" : "text-amber-600")}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-muted">{sub}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">{hint}</p>
    </div>
  );
}

function ImpactDot({ impact }: { impact: "cost" | "risk" | "better" | "neutral" }) {
  const map = {
    cost: ["bg-rose-500", "Costs BHN money not in the quote"],
    risk: ["bg-amber-500", "Worth settling before signing"],
    better: ["bg-emerald-500", "Better than last year"],
    neutral: ["bg-subtle/40", "No practical difference"],
  } as const;
  const [colour, label] = map[impact];
  return <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", colour)} title={label} aria-label={label} />;
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className={muted ? "text-subtle" : ""}>{k}</dt>
      <dd className={cn("tabular-nums", muted && "text-subtle")}>{v}</dd>
    </div>
  );
}
