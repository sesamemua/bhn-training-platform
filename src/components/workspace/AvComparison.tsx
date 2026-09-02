"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import {
  AV_LINES, AV_DOCS, AV_DELTAS, AV_TERM_CHANGES, AV_GROUP_LABELS, AV_SOURCE_FOLDER,
  amountOn, lineDelta, chargedOn, chargedDelta, itemReduction,
  chargedTotal, blanketRate, discountOf, discountRate,
  type AvGroup, type AvLine, type AvDoc,
} from "@/lib/symposium/av";
import { cn } from "@/lib/utils";
import { AvSourcePanes } from "./AvSourcePanes";

const cad = (n: number, dp = 2) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
const pct0 = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Column order is chronological, which is also the order of the argument. */
const COLS = [AV_DOCS.q2025, AV_DOCS.i2025, AV_DOCS.q2026] as const;

const GROUP_ORDER: AvGroup[] = ["streaming", "audio", "video", "lighting", "staging", "labour", "other"];

export function AvComparison() {
  const [only, setOnly] = useState<"all" | "changed" | "new">("all");
  const [basis, setBasis] = useState<"charged" | "list">("charged");
  /* Which row's source documents are on screen. Hover and focus both set
     it — a table you can only read with a mouse is a table half the
     office cannot read — and a click pins it so you can actually work
     with the panel instead of losing it the moment you move the mouse.

     It starts on the projectors because that is the row where the two
     documents disagree most interestingly, and because a dock that opens
     empty reads as broken. */
  const [open, setOpen] = useState<{ key: string; label: string }>(
    { key: "projectors", label: "Projectors ×2" },
  );
  const [pinned, setPinned] = useState(false);
  const [sheet, setSheet] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const peek = (key: string, label: string) => {
    if (!pinned) setOpen({ key, label });
  };
  const pick = (key: string, label: string) => {
    setOpen({ key, label });
    setPinned(true);
    setSheet(true);
  };

  const grouped = useMemo(() => {
    const delta = basis === "charged" ? chargedDelta : lineDelta;
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

      {/* ── The three answers to "how much has it gone up", all true, and
             the sentence that reconciles them. Getting this wrong is easy:
             the 2026 quote prints prices it then strikes out, so the
             printed column overstates by 27 points. */}
      <div className="rounded-xl border border-line bg-card p-3.5">
        <p className="text-[12.5px] font-bold text-fg">
          Three answers to &ldquo;how much has it gone up&rdquo;
        </p>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
          <Answer
            label="As printed"
            value={pct(AV_DELTAS.listRise)}
            sub={`${cad(AV_DOCS.i2025.gross, 0)} → ${cad(AV_DOCS.q2026.gross, 0)}`}
            tone="rose"
            hint="Overstates it. The 2026 quote lists five items at prices it then strikes out."
          />
          <Answer
            label="What Livecast will charge"
            value={pct(AV_DELTAS.chargedRise)}
            sub={`${cad(chargedTotal(AV_DOCS.i2025), 0)} → ${cad(chargedTotal(AV_DOCS.q2026), 0)}`}
            tone="emerald"
            hint="The like-for-like number: equipment and labour, after the reductions written on the quote."
          />
          <Answer
            label="What BHN pays"
            value={pct(AV_DELTAS.payableRise)}
            sub={`${cad(AV_DOCS.i2025.subtotal, 0)} → ${cad(AV_DOCS.q2026.subtotal, 0)} before tax`}
            tone="amber"
            hint="After each document's across-the-board cut too."
          />
        </div>
        <p className="mt-3 max-w-prose border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-muted">
          <strong className="text-fg">The gap between the last two is the thing to take into the
          conversation.</strong>{" "}
          The kit itself is {pct(AV_DELTAS.chargedRise)} dearer. The bill is{" "}
          {pct(AV_DELTAS.payableRise)} dearer because 2025 came with{" "}
          <strong className="text-fg">{cad(AV_DELTAS.lostGoodwill, 0)}</strong> of one-off
          reductions on top of its 10% — a &ldquo;50% off&rdquo; and a 100% item discount — and the
          2026 quote does not repeat them. Livecast is cutting{" "}
          {pct0(blanketRate(AV_DOCS.q2026))} off the bottom this year against{" "}
          {pct0(blanketRate(AV_DOCS.i2025))} last year.
        </p>
        <p className="mt-2 max-w-prose text-[11px] leading-relaxed text-subtle">
          The table shows charged amounts, with the struck-through list price underneath where
          the quote reduced one. Those five reductions come to exactly {cad(2320, 0)}, which is
          the quote&apos;s own &ldquo;Discount&rdquo; line — they are read off the document, not
          estimated. Switch to <strong className="text-muted">Listed</strong> for the printed
          figures. <strong className="text-muted">Hover any row</strong> to see what all three
          documents actually say about it.
        </p>
      </div>

      {/* ── The line-by-line table */}
      {/* ── Table and sources as columns, not an overlay.
             The old panel floated over the table it was explaining, was
             hidden below 1280px, and carried pointer-events-none so its
             own scroll area could not be scrolled. A dock costs a column
             of width and gives all three back. */}
      <div className="flex items-start gap-4">
      <div ref={wrap} className="min-w-0 flex-1 rounded-2xl border border-line bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-bold text-fg">Line by line</h2>
          <span className="text-[11px] text-subtle">{shown} of {AV_LINES.length}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <div className="mr-2 flex gap-1 rounded-lg bg-elevated p-0.5">
              {([["charged", "Charged"], ["list", "Listed"]] as const).map(([k, label]) => (
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
                <GroupRows key={group} group={group} lines={lines} basis={basis}
                  onPeek={peek} onPick={pick} activeKey={open.key} />
              ))}
            </tbody>
          </table>
        </div>
      </div>


        {/* Docked beside the table from xl up, sticky so it stays level
            with whatever row you are reading. */}
        <aside className="sticky top-4 hidden w-[26rem] shrink-0 xl:block 2xl:w-[30rem]">
          <AvSourcePanes
            key={open.key}
            lineKey={open.key}
            label={open.label}
            pinned={pinned}
            onPin={() => setPinned((v) => !v)}
            onClose={() => setPinned(false)}
            variant="dock"
          />
        </aside>
      </div>

      {/* Below xl there is no room to dock, so a row opens the same panel
          as a sheet. Same component, same modes — narrow screens get the
          feature rather than a note explaining they cannot have it. */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center xl:hidden">
          <button
            type="button"
            aria-label="Close source documents"
            onClick={() => { setSheet(false); setPinned(false); }}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative w-full max-w-3xl">
            <AvSourcePanes
              key={open.key}
              lineKey={open.key}
              label={open.label}
              pinned
              onPin={() => { setSheet(false); setPinned(false); }}
              onClose={() => { setSheet(false); setPinned(false); }}
              variant="sheet"
            />
          </div>
        </div>
      )}

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
  group, lines, basis, onPeek, onPick, activeKey,
}: {
  group: AvGroup;
  lines: AvLine[];
  basis: "charged" | "list";
  onPeek: (key: string, label: string) => void;
  onPick: (key: string, label: string) => void;
  activeKey: string;
}) {
  const valueOf = (l: AvLine, k: AvDoc["key"]) =>
    basis === "charged" ? chargedOn(l, k) : amountOn(l, k);
  const deltaOf = (l: AvLine) => (basis === "charged" ? chargedDelta(l) : lineDelta(l));
  const subtotal = (k: AvDoc["key"]) => lines.reduce((n, l) => n + valueOf(l, k), 0);

  return (
    <>
      <tr className="bg-elevated/60">
        <td colSpan={5} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
          {AV_GROUP_LABELS[group]}
        </td>
      </tr>
      {lines.map((l) => {
        const active = l.key === activeKey;
        return (
          <tr
            key={l.key}
            tabIndex={0}
            role="button"
            aria-label={`Show what the three documents say about ${l.label}`}
            onMouseEnter={() => onPeek(l.key, l.label)}
            onFocus={() => onPeek(l.key, l.label)}
            onClick={() => onPick(l.key, l.label)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(l.key, l.label); }
            }}
            className={cn(
              "group cursor-pointer border-b border-line/60 align-top outline-none transition-colors last:border-0",
              "hover:bg-elevated/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent",
              active && "bg-accent/[0.07]",
            )}
          >
            <td className={cn("px-4 py-2.5", active && "border-l-2 border-accent pl-[14px]")}>
              <p className="font-semibold text-fg">{l.label}</p>
              {l.note && <p className="mt-0.5 max-w-prose text-[11px] leading-relaxed text-muted">{l.note}</p>}
            </td>
            {COLS.map((doc) => {
              const e = l[doc.key];
              const cut = itemReduction(l, doc.key);
              return (
                <td key={doc.key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {e ? (
                    <>
                      <span className={cn("font-semibold", doc.key === "q2026" ? "text-fg" : "text-muted")}>
                        {cad(valueOf(l, doc.key), 0)}
                      </span>
                      {/* When the document strikes a price out, show it struck
                          here too — that is the whole reason this row is
                          cheaper than it first looks. */}
                      {basis === "charged" && cut > 0 ? (
                        <span className="block text-[10px] text-subtle line-through">{cad(e.total, 0)}</span>
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

function Answer({
  label, value, sub, tone, hint,
}: { label: string; value: string; sub: string; tone: "rose" | "emerald" | "amber"; hint: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums", {
        rose: "text-rose-500", emerald: "text-emerald-500", amber: "text-amber-600",
      }[tone])}>
        {value}
      </p>
      <p className="text-[11px] tabular-nums text-subtle">{sub}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p>
    </div>
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
