"use client";

/**
 * The product view: design, colour, size and quantity, then Add to cart.
 * A bottom sheet on a phone, a centred dialog from `sm` up. Radix handles
 * the focus trap, Escape and the scroll lock. On a phone the sheet is
 * taller than the screen, so the title with Close and the Add button stay
 * pinned while the options scroll between them.
 *
 * Size starts unpicked on purpose — a preselected M is the size most
 * people would add without noticing. Pressing Add without one says so and
 * moves focus to the sizes instead of greying the button out.
 */
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { BadgeCheck, Check, FlaskConical, Ruler, ShoppingBag, X } from "lucide-react";
import {
  COLOUR_LABEL, MAX_QTY, PRODUCT_IMAGE_SIZE, SIZE_CHART, STORE, STORE_DESIGNS, TEE_COLOURS,
  TEE_PRICE_CAD, TEE_SIZES, formatStoreCad, teeAlt,
  type StoreDesign, type TeeColour, type TeeSize,
} from "@/lib/merch/store";
import { cn } from "@/lib/utils";
import { QtyStepper, RadioPills } from "@/components/merch/StoreControls";
import { Swatch } from "@/components/merch/StoreSwatch";

export interface AddResult {
  /** How many actually went in — less than asked when the line hit the cap. */
  added: number;
  /** Tees in the cart afterwards. */
  count: number;
}

export function StoreProductSheet({
  design,
  colour,
  onColour,
  onDesign,
  onClose,
  onAdd,
  onOpenCart,
  onCloseAutoFocus,
}: {
  design: StoreDesign | null;
  colour: TeeColour;
  onColour: (colour: TeeColour) => void;
  onDesign: (slug: string) => void;
  onClose: () => void;
  onAdd: (size: TeeSize, qty: number) => AddResult;
  onOpenCart: () => void;
  /** Where focus goes on close; there is no Radix Trigger to fall back on. */
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [size, setSize] = useState<TeeSize | null>(null);
  const [qty, setQty] = useState(1);
  const [needsSize, setNeedsSize] = useState(false);
  const [done, setDone] = useState<(AddResult & { label: string }) | null>(null);
  const sizeGroup = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  // Start clean after every close, however it happened. Radix only calls
  // onOpenChange for closes it starts; "Open the cart" closes this sheet from
  // the parent, and the old "In the cart" note used to greet the next tee.
  // The size is kept between tees (most people buy one size).
  const isOpen = design !== null;
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setDone(null);
      setNeedsSize(false);
      setQty(1);
    }
  }

  // The confirmation lands below the button, often below the fold of a tall sheet.
  useEffect(() => {
    if (done) doneRef.current?.scrollIntoView({ block: "nearest" });
  }, [done]);

  function add() {
    if (!design) return;
    if (!size) {
      setNeedsSize(true);
      sizeGroup.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus();
      return;
    }
    const result = onAdd(size, qty);
    setDone({ ...result, label: `${design.productName} · ${COLOUR_LABEL[colour]} · ${size}` });
    // Back to one, so switching to the next critter does not quietly carry a 4 across.
    setQty(1);
  }

  // Anything changed after adding means the confirmation no longer describes the form.
  const touch = () => setDone(null);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="lfp-fade fixed inset-0 z-[100] bg-slate-950/55 backdrop-blur-[2px]" />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            // Scroll padding keeps a focused size or the confirmation clear of the pinned bars.
            "lfp-sheet fixed inset-x-0 bottom-0 z-[101] max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-card-solid text-fg shadow-modal outline-none max-sm:scroll-pb-28 max-sm:scroll-pt-24",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(58rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
          )}
        >
          {design && (
            <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              {/* ── The tee ─────────────────────────────────────── */}
              {/* Sticky from sm up, so the photo stays in view while the picker scrolls. */}
              <div className="bg-elevated/60 p-4 sm:sticky sm:top-0 sm:self-start sm:rounded-l-3xl sm:p-6">
                {/* The badge moves here on a phone, so the pinned title bar stays short. */}
                <p className="mb-3 flex justify-center sm:hidden">
                  <Badge text={design.badge} />
                </p>
                <Image
                  key={design.images[colour]}
                  src={design.images[colour]}
                  alt={teeAlt(design, colour)}
                  width={PRODUCT_IMAGE_SIZE.width}
                  height={PRODUCT_IMAGE_SIZE.height}
                  sizes="(min-width: 640px) 26rem, 60vw"
                  className="lfp-fade mx-auto h-auto w-full max-w-[11rem] rounded-2xl sm:max-w-none"
                />
                <p className="mt-3 text-center text-[11px] font-medium text-subtle">
                  Shown in {COLOUR_LABEL[colour].toLowerCase()}. Mascot not to scale; flask contents not included.
                </p>
              </div>

              {/* ── The picker ──────────────────────────────────── */}
              <div className="space-y-5 p-4 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
                {/* Pinned on a phone once the photo has scrolled away, so Close never leaves the screen. */}
                <div className="flex items-start gap-3 max-sm:sticky max-sm:top-0 max-sm:z-10 max-sm:-mx-4 max-sm:-mt-4 max-sm:border-b max-sm:border-line max-sm:bg-card-solid max-sm:px-4 max-sm:py-3">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 max-sm:hidden">
                      <Badge text={design.badge} />
                    </p>
                    <Dialog.Title className="text-lg font-bold leading-tight tracking-tight text-fg sm:text-2xl">
                      {design.productName}
                    </Dialog.Title>
                    <p className="mt-0.5 font-mono text-[13px] font-bold tabular-nums text-fg sm:mt-1 sm:text-sm">
                      {formatStoreCad(TEE_PRICE_CAD)}
                      <span className="ml-1.5 font-sans text-[11px] font-medium text-subtle">CAD each (simulated)</span>
                    </p>
                  </div>
                  <Dialog.Close
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted ring-1 ring-inset ring-line transition-colors outline-none hover:bg-elevated hover:text-fg focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label="Close"
                  >
                    <X size={16} aria-hidden />
                  </Dialog.Close>
                </div>

                <Dialog.Description className="text-[13.5px] leading-relaxed text-muted">
                  {design.blurb}
                </Dialog.Description>

                <div>
                  <h3 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-subtle">Lab specs</h3>
                  <ul className="mt-1.5 space-y-1">
                    {design.labSpecs.map((s) => (
                      <li key={s} className="flex items-start gap-1.5 text-[12.5px] text-fg">
                        <FlaskConical size={12} className="mt-0.5 shrink-0 text-brand-500" aria-hidden />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Design */}
                <div>
                  <p id="lfp-design-label" className="text-[12px] font-bold text-fg">
                    Design <span className="font-medium text-muted">· {design.productName}</span>
                  </p>
                  <RadioPills
                    labelId="lfp-design-label"
                    options={STORE_DESIGNS.map((d) => ({ value: d.slug, label: d.productName }))}
                    value={design.slug}
                    onChange={(slug) => {
                      touch();
                      onDesign(slug);
                    }}
                    className="mt-2 flex flex-wrap gap-1.5"
                    // A padded background, not a ring: an inset ring would sit under the photo.
                    // Fixed radius: the design system stretches rounded-xl to a pill at this size.
                    optionClassName={(checked) =>
                      cn(
                        "rounded-[12px] p-[3px] transition-all",
                        checked ? "bg-brand-500" : "bg-line opacity-75 hover:opacity-100",
                      )
                    }
                    render={(o) => {
                      const d = STORE_DESIGNS.find((x) => x.slug === o.value)!;
                      return (
                        <Image
                          src={d.images[colour]}
                          alt=""
                          width={PRODUCT_IMAGE_SIZE.width}
                          height={PRODUCT_IMAGE_SIZE.height}
                          sizes="48px"
                          className="block h-[3.25rem] w-[2.9rem] rounded-[9px] object-cover"
                        />
                      );
                    }}
                  />
                </div>

                {/* Colour */}
                <div>
                  <p id="lfp-colour-label" className="text-[12px] font-bold text-fg">
                    Colour <span className="font-medium text-muted">· {COLOUR_LABEL[colour]}</span>
                  </p>
                  <RadioPills
                    labelId="lfp-colour-label"
                    options={TEE_COLOURS.map((c) => ({ value: c, label: COLOUR_LABEL[c] }))}
                    value={colour}
                    onChange={(c) => {
                      touch();
                      onColour(c);
                    }}
                    className="mt-2 flex flex-wrap gap-2"
                    optionClassName={(checked) =>
                      cn(
                        "inline-flex h-11 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[12.5px] font-semibold ring-inset transition-colors",
                        checked ? "bg-brand-50 text-brand-800 ring-2 ring-brand-500" : "text-muted ring-1 ring-line hover:text-fg",
                      )
                    }
                    render={(o, checked) => (
                      <>
                        <Swatch colour={o.value} checked={checked} />
                        {o.label}
                      </>
                    )}
                  />
                </div>

                {/* Size */}
                <div>
                  <p id="lfp-size-label" className="text-[12px] font-bold text-fg">
                    Size <span className="font-medium text-muted">· {size ?? "pick one"}</span>
                  </p>
                  <RadioPills
                    groupRef={sizeGroup}
                    labelId="lfp-size-label"
                    options={TEE_SIZES.map((s) => ({ value: s, label: s }))}
                    value={size}
                    onChange={(s) => {
                      touch();
                      setNeedsSize(false);
                      setSize(s);
                    }}
                    className="mt-2 flex flex-wrap gap-1.5"
                    optionClassName={(checked) =>
                      cn(
                        "inline-flex h-11 min-w-11 items-center justify-center rounded-xl px-2.5 font-mono text-[13px] font-bold ring-inset transition-colors",
                        checked ? "bg-brand-600 text-white ring-2 ring-brand-600" : "bg-card text-fg ring-1 ring-line hover:bg-elevated",
                      )
                    }
                    render={(o) => o.label}
                  />
                  {needsSize && (
                    <p role="alert" className="mt-2 text-[12px] font-semibold text-rose-600">
                      Pick a size first. Even simulated tees need one.
                    </p>
                  )}
                  <details className="group mt-2.5 rounded-xl border border-line bg-card px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[12px] font-semibold text-brand-700 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                      <Ruler size={13} aria-hidden /> Size guide
                      <span className="ml-auto text-[11px] font-medium text-subtle group-open:hidden">Show</span>
                      <span className="ml-auto hidden text-[11px] font-medium text-subtle group-open:inline">Hide</span>
                    </summary>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted">{STORE.sizeGuide}</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <caption className="sr-only">Approximate chest widths by size</caption>
                        <thead>
                          <tr className="text-[10.5px] uppercase tracking-wider text-subtle">
                            <th scope="col" className="py-1 pr-3 font-bold">Size</th>
                            <th scope="col" className="py-1 font-bold">Chest, cm (approx.)</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono tabular-nums text-fg">
                          {SIZE_CHART.map((r) => (
                            <tr key={r.size} className={cn("border-t border-line", r.size === size && "bg-brand-50/70")}>
                              <th scope="row" className="py-1 pr-3 font-bold">{r.size}</th>
                              <td className="py-1">{r.chestCm}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>

                {/* Quantity */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold text-fg">Quantity</p>
                    <p className="text-[11px] text-subtle">Up to {MAX_QTY} of each. It is a pop-up, not a warehouse.</p>
                  </div>
                  <QtyStepper
                    label="Quantity"
                    value={qty}
                    onChange={(n) => {
                      touch();
                      setQty(n);
                    }}
                  />
                </div>

                {/* Pinned to the bottom on a phone, so the main action is on screen from the start. */}
                <div className="max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-4 max-sm:border-t max-sm:border-line max-sm:bg-card-solid max-sm:px-4 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:pt-3">
                  <button
                    type="button"
                    onClick={add}
                    className="lfp-press inline-flex min-h-12 w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-card-rest transition-colors outline-none hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card-solid"
                  >
                    <ShoppingBag size={16} aria-hidden />
                    Add to cart
                    {/* Inherits the button colour, not a dimmed white: Voltage flips hover to dark-on-cyan. */}
                    <span className="font-mono text-[12px] font-semibold tabular-nums">
                      {formatStoreCad(qty * TEE_PRICE_CAD)} (simulated)
                    </span>
                  </button>
                </div>

                {done && (
                  <div ref={doneRef} className="lfp-rise scroll-mb-4 rounded-2xl border border-emerald-300/70 bg-emerald-50 px-3.5 py-3 text-emerald-900">
                    <p className="flex items-start gap-1.5 text-[13px] font-bold">
                      <Check size={15} className="mt-0.5 shrink-0" aria-hidden />
                      {done.added > 0
                        ? `In the cart: ${done.added} × ${done.label}.`
                        : `That line is already at ${MAX_QTY}, the most one critter can carry.`}
                    </p>
                    <p className="mt-0.5 pl-5 text-[12px]">
                      {done.count} tee{done.count === 1 ? "" : "s"} in the cart so far.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2 pl-5">
                      <button
                        type="button"
                        onClick={onOpenCart}
                        className="inline-flex h-9 items-center rounded-full bg-emerald-700 px-3.5 text-[12px] font-bold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                      >
                        Open the cart
                      </button>
                      <Dialog.Close className="inline-flex h-9 items-center rounded-full px-3.5 text-[12px] font-bold text-emerald-900 ring-1 ring-inset ring-emerald-400 outline-none hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-600">
                        Keep browsing
                      </Dialog.Close>
                    </div>
                  </div>
                )}

                <p className="text-[11px] leading-relaxed text-subtle">{STORE.disclaimer}</p>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-brand-700 ring-1 ring-inset ring-brand-200">
      <BadgeCheck size={11} aria-hidden /> {text}
    </span>
  );
}
