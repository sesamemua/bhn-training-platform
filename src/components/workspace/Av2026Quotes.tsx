"use client";

/**
 * The Symposium AV quote as it stands — round 3 — and the decision it
 * leaves: the room alone, or the room with a stream.
 *
 * The lead is the three numbers that decision needs, AV / streaming /
 * total, each one printed on a Livecast document or the difference of two
 * (see AV26_DECISION). The pair round 3 replaced sits below, collapsed:
 * it is why the number moved, not what to sign.
 */
import { useState } from "react";
import { FileText } from "lucide-react";
import {
  AV26_COMBINED, AV26_CURRENT, AV26_DECISION, AV26_DOCS, AV26_ORDER,
  AV26_VS_SUPERSEDED, chargedLine,
  type Av26Doc, type Av26Key,
} from "@/lib/symposium/av-2026";
import { pagesOf } from "@/lib/symposium/av";
import { cn } from "@/lib/utils";
import { PageSheet } from "./AvSourcePanes";

const cad = (n: number, dp = 2) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: dp, maximumFractionDigits: dp });

export function Av2026Quotes() {
  const [reading, setReading] = useState<Av26Key | null>(null);

  const d = AV26_DECISION;
  const streamShare = Math.round((d.streaming.total / d.roomOnly.total) * 100);

  return (
    <div className="space-y-6">
      {/* ── The decision. First, because it is the only thing on this
             page anyone has to act on. */}
      <section className="rounded-xl border-2 border-line-strong bg-card p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-subtle">
          The decision — the room, or the room with a stream
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-subtle">
                <th scope="col" className="pb-2 text-left font-semibold"><span className="sr-only">Line</span></th>
                <th scope="col" className="pb-2 text-right font-semibold">Before tax</th>
                <th scope="col" className="pb-2 pl-6 text-right font-semibold">With HST</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr>
                <th scope="row" className="py-1.5 text-left font-semibold text-fg">AV — the room</th>
                <td className="py-1.5 text-right font-mono text-muted">{cad(d.roomOnly.beforeTax)}</td>
                <td className="py-1.5 pl-6 text-right font-mono text-[16px] font-bold text-fg">{cad(d.roomOnly.total)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-1.5 text-left font-semibold text-fg">
                  Streaming, added on top
                  <span className="ml-2 text-[11px] font-normal text-subtle">+{streamShare}% on the room</span>
                </th>
                <td className="py-1.5 text-right font-mono text-muted">+{cad(d.streaming.beforeTax)}</td>
                <td className="py-1.5 pl-6 text-right font-mono text-[16px] font-bold text-brand-700">+{cad(d.streaming.total)}</td>
              </tr>
              <tr className="border-t-2 border-line-strong">
                <th scope="row" className="pt-2.5 text-left font-bold text-fg">Total with streaming</th>
                <td className="pt-2.5 text-right font-mono text-muted">{cad(d.withStream.beforeTax)}</td>
                <td className="pt-2.5 pl-6 text-right font-mono text-[22px] font-bold text-fg">{cad(d.withStream.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          <strong className="text-fg">Without the stream: {cad(d.roomOnly.total)}.</strong> That is
          Livecast&apos;s own AV-only price — its room lines are round 3&apos;s, line for line — so
          dropping the stream means asking them to remove the “Streaming and video” section, which
          the terms allow. <strong className="text-fg">With it: {cad(d.withStream.total)}.</strong>{" "}
          All figures include every discount on the quote.
        </p>
      </section>

      {/* ── Why round 3 is lower than the pair it replaced. */}
      <p className="rounded-lg border border-emerald-600/30 bg-emerald-600/[0.05] px-4 py-3 text-[12.5px] leading-relaxed text-muted">
        <strong className="text-fg">Back on the 1 September price.</strong> Round 3 totals{" "}
        {cad(d.withStream.total)}, the same as {AV26_VS_SUPERSEDED.supersededRef}. Quoted on its own
        the stream was {cad(d.streamingAsOwnQuote)}; folded back into the room quote it is{" "}
        {cad(d.streaming.total)} — {cad(d.bundlingSaves)} less, exactly what splitting it out had
        added, because one document carries one delivery fee and one crew.
      </p>

      {/* ── Round 3 itself, every line. */}
      <QuoteCard doc={AV26_DOCS[AV26_CURRENT]} onRead={() => setReading(AV26_CURRENT)} current />

      {/* ── The pair round 3 replaced. Kept because it is why the number
             moved; collapsed because it is not what to sign. */}
      <details className="group rounded-xl border border-line bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
          <span>
            Superseded — the split pair from earlier on 8 September
            <span className="ml-2 font-mono text-[12px] font-normal text-subtle">{cad(AV26_COMBINED.total)} together</span>
          </span>
          <span className="text-[11px] font-normal text-subtle group-open:hidden">Show</span>
          <span className="hidden text-[11px] font-normal text-subtle group-open:inline">Hide</span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
      <section className="rounded-xl border-2 border-amber-500/50 bg-amber-500/[0.06] p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
          When the quote was split in two
        </p>
        <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-fg tabular-nums">
          +{cad(AV26_VS_SUPERSEDED.difference)}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          {cad(AV26_COMBINED.total)} across the two, against{" "}
          {cad(AV26_VS_SUPERSEDED.supersededTotal)} on{" "}
          {AV26_VS_SUPERSEDED.supersededRef} ({AV26_VS_SUPERSEDED.supersededDated}), which these
          replace. <strong className="text-fg">The kit did not change</strong> — every rental line
          below is on the superseded quote at the same price. The difference is labour and
          delivery, which went from {cad(AV26_VS_SUPERSEDED.labourBefore, 0)} to{" "}
          {cad(AV26_VS_SUPERSEDED.labourAfter, 0)} before tax because a second document carries a
          second crew and a second van.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {AV26_VS_SUPERSEDED.reasons.map((r) => (
            <li key={r.label} className="rounded-lg border border-line bg-card p-3">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold text-fg">{r.label}</span>
                <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-amber-700">
                  +{cad(r.amount, 0)}
                </span>
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{r.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The two documents, side by side. */}
      <div className="grid gap-4 @3xl:grid-cols-2">
        {AV26_ORDER.map((k) => (
          <QuoteCard key={k} doc={AV26_DOCS[k]} onRead={() => setReading(k)} />
        ))}
      </div>

      {/* ── What BHN actually pays. */}
      <section className="rounded-xl border-2 border-line-strong bg-card p-4 sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
          The two together
        </p>
        <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          <Money label="Line items" value={AV26_COMBINED.gross} />
          <Money label="Discount" value={AV26_COMBINED.discount} />
          <Money label="Additional discount" value={AV26_COMBINED.additionalDiscount} />
          <Money label="HST" value={AV26_COMBINED.tax} />
        </dl>
        <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="text-[13px] font-bold text-fg">Total</span>
          <span className="font-mono text-[20px] font-bold tabular-nums text-fg">
            {cad(AV26_COMBINED.total)}
          </span>
        </p>
      </section>
        </div>
      </details>

      {reading && (
        <DocumentReader docKey={reading} onClose={() => setReading(null)} />
      )}
    </div>
  );
}

function QuoteCard({ doc, onRead, current }: { doc: Av26Doc; onRead: () => void; current?: boolean }) {
  return (
    <section className={cn("flex flex-col rounded-xl border-2 bg-card", current ? "border-brand-500/60" : "border-line-strong")}>
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-[14px] font-bold text-fg">
            {doc.title}
            {current && (
              <span className="ml-2 rounded bg-brand-600 px-1.5 py-0.5 align-middle text-[9.5px] font-bold uppercase tracking-wide text-white">
                Current quote
              </span>
            )}
          </h2>
          <span className="font-mono text-[11px] text-subtle">{doc.ref}</span>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-subtle">{doc.scope}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[22px] font-bold tabular-nums text-fg">
            {cad(doc.total)}
          </span>
          <span className="text-[11.5px] text-subtle">
            dated {doc.dated} · expires {doc.expires}
          </span>
        </p>
      </header>

      <div className="min-w-0 flex-1 divide-y divide-line">
        {doc.sections.map((section) => (
          <div key={section.heading} className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
              {section.heading}
            </p>
            <ul className="mt-2 space-y-2">
              {section.lines.map((line) => (
                <li key={line.name} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-snug text-fg">{line.name}</span>
                    {/* Quantity as "2 × $350 each", beside the name — never
                        "2 × $700" beside the price, where $700 is already
                        the line total and the eye multiplies it. Per-unit
                        is the list price (wasUnit where the quote reduced
                        one), so the struck list total below still adds up. */}
                    {line.qty > 1 && (
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-subtle">
                        {line.qty} × {cad(line.wasUnit ?? line.unit, 0)} each
                      </span>
                    )}
                    {line.detail && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-subtle">
                        {line.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11.5px] tabular-nums">
                    {/* What is actually charged for the line — see
                        chargedLine(). Showing `total` here put the list
                        price where the charge should be: the Aputure
                        lights read $900 when the quote makes them free. */}
                    <span className={cn("block", line.wasUnit !== undefined ? "font-semibold text-emerald-700" : "text-fg")}>
                      {chargedLine(line) === 0 && line.wasUnit !== undefined ? "Free" : cad(chargedLine(line), 0)}
                    </span>
                    {/* The struck-through list price, where the quote
                        reduced one. It is on the document; leaving it
                        off would make the discount line unexplainable. */}
                    {line.wasUnit !== undefined && (
                      <span className="block text-[10.5px] text-subtle line-through">
                        {cad(line.total, 0)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid gap-1 border-t border-line pt-2 text-[11.5px]">
              <Money label="Subtotal" value={section.subtotal} small />
              {section.discount !== undefined && <Money label="Discount" value={section.discount} small />}
              <Money label="Tax" value={section.tax} small />
              <Money label="Section total" value={section.total} small strong />
            </dl>
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onRead}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg transition-colors hover:bg-elevated"
        >
          <FileText size={13} /> Read all {doc.pages} pages
        </button>
        <span className="ml-auto text-[11px] text-subtle">{doc.paymentDue}</span>
      </footer>
    </section>
  );
}

function Money({
  label, value, small, strong,
}: { label: string; value: number; small?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(small ? "text-[11.5px]" : "text-[13px]", strong ? "font-bold text-fg" : "text-muted")}>
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          small ? "text-[11.5px]" : "text-[13px]",
          strong ? "font-bold text-fg" : value < 0 ? "text-emerald-600" : "text-fg",
        )}
      >
        {cad(value)}
      </dd>
    </div>
  );
}

/**
 * The whole document, at a size you can read it.
 *
 * Same PageSheet the 2025 comparison's viewer uses — the page renders
 * come from the same manifest and the same admin-gated route, so there
 * is one implementation of "draw a page of a Livecast quote".
 */
function DocumentReader({ docKey, onClose }: { docKey: Av26Key; onClose: () => void }) {
  const doc = AV26_DOCS[docKey];
  const pages = pagesOf(docKey);
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${doc.title} — ${doc.ref}`}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col p-3 sm:p-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                {doc.ref} · {pages.length} pages
              </p>
              <p className="truncate text-[14px] font-bold text-fg">{doc.title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-subtle transition-colors hover:bg-elevated hover:text-fg"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-elevated/40 p-3 sm:p-4">
            <div className="mx-auto flex max-w-[60rem] flex-col gap-4">
              {pages.map(({ page }) => (
                <PageSheet
                  key={page}
                  docKey={docKey}
                  page={page}
                  box={null}
                  scrollTo={false}
                  zoom={1}
                  label={doc.title}
                  ref_={doc.ref}
                  caption={`Page ${page} of ${pages.length}`}
                />
              ))}
            </div>
          </div>
          <p className="shrink-0 border-t border-line px-4 py-1.5 text-[10.5px] text-subtle">
            {doc.scope} — as sent by Livecast on {doc.dated}.
          </p>
        </div>
      </div>
    </div>
  );
}
