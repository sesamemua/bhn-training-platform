"use client";

/**
 * The two quotes Livecast sent on 8 September 2026, and what splitting
 * one quote into two did to the price.
 *
 * The lead is not the totals. It is that the same event, quoted twice
 * instead of once, costs $1,220.40 more — and that almost all of the
 * difference is a second delivery fee and a fourth operator, not
 * equipment. Every rental line here appears on the superseded quote at
 * the same price, which is what makes the labour figure the thing to
 * take into the conversation.
 */
import { useState } from "react";
import { FileText } from "lucide-react";
import {
  AV26_COMBINED, AV26_DOCS, AV26_ORDER, AV26_VS_SUPERSEDED,
  type Av26Doc, type Av26Key,
} from "@/lib/symposium/av-2026";
import { pagesOf } from "@/lib/symposium/av";
import { cn } from "@/lib/utils";
import { PageSheet } from "./AvSourcePanes";

const cad = (n: number, dp = 2) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: dp, maximumFractionDigits: dp });

export function Av2026Quotes() {
  const [reading, setReading] = useState<Av26Key | null>(null);

  return (
    <div className="space-y-6">
      {/* ── What the split cost. Stated first because it is the only
             number on this page that needs a decision. */}
      <section className="rounded-xl border-2 border-amber-500/50 bg-amber-500/[0.06] p-4 sm:p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
          Two quotes now, one before
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

      {reading && (
        <DocumentReader docKey={reading} onClose={() => setReading(null)} />
      )}
    </div>
  );
}

function QuoteCard({ doc, onRead }: { doc: Av26Doc; onRead: () => void }) {
  return (
    <section className="flex flex-col rounded-xl border-2 border-line-strong bg-card">
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-[14px] font-bold text-fg">{doc.title}</h2>
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
                    {line.detail && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-subtle">
                        {line.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11.5px] tabular-nums">
                    <span className="block text-fg">
                      {line.qty > 1 && <span className="text-subtle">{line.qty} × </span>}
                      {cad(line.total, 0)}
                    </span>
                    {/* The struck-through list price, where the quote
                        reduced one. It is on the document; leaving it
                        off would make the discount line unexplainable. */}
                    {line.wasUnit !== undefined && (
                      <span className="block text-[10.5px] text-subtle line-through">
                        {cad(line.wasUnit * line.qty, 0)}
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
