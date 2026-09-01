"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, Plus } from "lucide-react";
import {
  AV_LINES, AV_DOCS, AV_DELTAS, AV_TERM_CHANGES, AV_GROUP_LABELS, AV_SOURCE_FOLDER,
  amountOn, lineDelta, newIn2026, unquotedIn2025,
  type AvGroup, type AvLine,
} from "@/lib/symposium/av";
import { cn } from "@/lib/utils";

const cad = (n: number, dp = 2) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

/** Column order is chronological, which is also the order of the argument. */
const COLS = [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026] as const;

const GROUP_ORDER: AvGroup[] = ["streaming", "audio", "video", "lighting", "staging", "labour", "other"];

export function AvComparison() {
  const [only, setOnly] = useState<"all" | "changed" | "new">("all");

  const grouped = useMemo(() => {
    const pass = (l: AvLine) => {
      if (only === "new") return !!l.q2026 && !l.q2025 && !l.i2025;
      if (only === "changed") return lineDelta(l) !== 0;
      return true;
    };
    return GROUP_ORDER
      .map((g) => ({ group: g, lines: AV_LINES.filter((l) => l.group === g && pass(l)) }))
      .filter((s) => s.lines.length > 0);
  }, [only]);

  const shown = grouped.reduce((n, s) => n + s.lines.length, 0);

  return (
    <div className="space-y-6">
      {/* ── The three headline numbers. Quote-vs-actual first: comparing
             2026 against last year's QUOTE gives 47%, which is true and
             misleading, because that quote is not what was paid. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Headline
          label="2026 quote vs 2025 actual"
          value={cad(AV_DELTAS.quoteVsActual.amount, 2)}
          sub={`${pct(AV_DELTAS.quoteVsActual.pct)} · ${cad(AV_DOCS.i2025.total)} → ${cad(AV_DOCS.q2026.total)}`}
          tone="up"
          hint="The fair comparison — this year's quote against what last year really cost."
        />
        <Headline
          label="2025 quote vs 2025 actual"
          value={cad(AV_DELTAS.overrun2025.amount, 2)}
          sub={`${pct(AV_DELTAS.overrun2025.pct)} over quote`}
          tone="warn"
          hint="How far last year drifted after the quote was signed. The best guide to how far this one will."
        />
        <Headline
          label="If 2026 drifts the same way"
          value={cad(AV_DELTAS.projected2026, 0)}
          sub={`${cad(AV_DOCS.q2026.total)} quoted + ${pct(AV_DELTAS.overrun2025.pct)}`}
          tone="warn"
          hint="Not a forecast — the 2026 quote scaled by last year's overrun. Budget headroom, not a number to plan on."
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

      {/* ── What was never quoted last year. This is the finding that
             makes the 2026 quote easier to read: five lines appeared only
             on the invoice, and three of them are now quoted up front. */}
      <Callout
        icon={<AlertTriangle size={14} />}
        tone="amber"
        title={`${unquotedIn2025().length} lines were billed in 2025 but never quoted`}
      >
        <p>
          {unquotedIn2025().map((l) => l.label).join(", ")} — {cad(unquotedIn2025().reduce((n, l) => n + amountOn(l, "i2025"), 0))} of
          equipment that appeared on the invoice and on no estimate, plus 4 hours of
          labour over the 20 quoted. Together that is the {cad(AV_DELTAS.overrun2025.amount)} overrun.
        </p>
        <p className="mt-1.5">
          Three of them — the ATEM switcher, the encoder kit and the Aputure lights — are
          quoted up front this year. That is the quote getting more honest, not the price
          getting worse, and it is part of why the 2026 figure looks steep.
        </p>
      </Callout>

      <Callout
        icon={<Plus size={14} />}
        tone="accent"
        title={`${newIn2026().length} things on the 2026 quote appear on neither 2025 document`}
      >
        <ul className="mt-1 space-y-1">
          {newIn2026().map((l) => (
            <li key={l.key} className="flex gap-2">
              <span className="tabular-nums font-semibold text-fg">{cad(amountOn(l, "q2026"), 0)}</span>
              <span><strong className="text-fg">{l.label}</strong> — {l.note}</span>
            </li>
          ))}
        </ul>
      </Callout>

      {/* ── The line-by-line table */}
      <div className="rounded-2xl border border-line bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-bold text-fg">Line by line</h2>
          <span className="text-[11px] text-subtle">{shown} of {AV_LINES.length}</span>
          <div className="ml-auto flex gap-1">
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
                <th className="px-4 py-2 text-right font-bold">vs actual</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ group, lines }) => (
                <GroupRows key={group} group={group} lines={lines} />
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
            Read this before the table above. Two of these commit BHN to spending that is not
            in the quote at all, and one is a contradiction on the face of the document.
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

function GroupRows({ group, lines }: { group: AvGroup; lines: AvLine[] }) {
  const subtotal = (k: "q2025" | "i2025" | "q2026") =>
    lines.reduce((n, l) => n + amountOn(l, k), 0);

  return (
    <>
      <tr className="bg-elevated/60">
        <td colSpan={5} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
          {AV_GROUP_LABELS[group]}
        </td>
      </tr>
      {lines.map((l) => {
        const d = lineDelta(l);
        return (
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
                        {cad(e.total, 0)}
                      </span>
                      {e.qty > 1 && (
                        <span className="block text-[10px] text-subtle">{e.qty} × {cad(e.unit, 0)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
              );
            })}
            <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
              <Delta n={d} />
            </td>
          </tr>
        );
      })}
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

function Callout({
  icon, tone, title, children,
}: { icon: React.ReactNode; tone: "amber" | "accent"; title: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      "rounded-xl border p-3.5",
      tone === "amber" ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-accent/30 bg-accent/[0.05]",
    )}>
      <p className={cn(
        "flex items-center gap-1.5 text-[12.5px] font-bold",
        tone === "amber" ? "text-amber-600" : "text-accent",
      )}>
        {icon}{title}
      </p>
      <div className="mt-1.5 max-w-prose text-[11.5px] leading-relaxed text-muted">{children}</div>
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
