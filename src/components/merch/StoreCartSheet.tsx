"use client";

/**
 * The cart, and after Checkout the receipt, in one side sheet.
 *
 * Checkout asks for nothing. There is no name, email, address or card
 * step because nothing is bought: the button turns the cart into a joke
 * receipt and empties it. The receipt lives in memory only and is gone
 * when the sheet is closed.
 */
import { useEffect, useRef } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { PartyPopper, Receipt, ShoppingBag, Trash2, X } from "lucide-react";
import {
  COLOUR_LABEL, PRODUCT_IMAGE_SIZE, STORE, TEE_PRICE_CAD, formatStoreCad, resolveLines,
  subtotalCad, cartCount, type Cart, type StoreReceipt,
} from "@/lib/merch/store";
import { QtyStepper } from "@/components/merch/StoreControls";

export function StoreCartSheet({
  open,
  onOpenChange,
  cart,
  receipt,
  onQty,
  onRemove,
  onCheckout,
  onNewOrder,
  onCloseAutoFocus,
  motionPaused,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: Cart;
  receipt: StoreReceipt | null;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onCheckout: () => void;
  onNewOrder: () => void;
  /** Where focus goes on close; there is no Radix Trigger to fall back on. */
  onCloseAutoFocus: (event: Event) => void;
  /** The page's Pause motion switch. The sheet is portalled outside the page, so it is passed in. */
  motionPaused: boolean;
}) {
  const lines = resolveLines(cart);
  const count = cartCount(cart);
  const receiptHeading = useRef<HTMLHeadingElement>(null);
  const cartHeading = useRef<HTMLHeadingElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  // After Remove, the button that was pressed is gone. Park focus on the
  // neighbouring line's Remove ("" means the heading, when the cart empties)
  // rather than letting it fall back to the whole dialog.
  const focusAfterRemove = useRef<string | null>(null);

  function remove(key: string) {
    const i = lines.findIndex((l) => l.key === key);
    focusAfterRemove.current = (lines[i + 1] ?? lines[i - 1])?.key ?? "";
    onRemove(key);
  }

  useEffect(() => {
    const target = focusAfterRemove.current;
    if (target === null) return;
    focusAfterRemove.current = null;
    (target ? removeButtons.current.get(target) : cartHeading.current)?.focus();
  }, [cart]);

  // Checkout swaps the whole panel, so focus follows to the receipt
  // instead of being dropped with the button that was pressed.
  useEffect(() => {
    if (open && receipt) receiptHeading.current?.focus();
  }, [open, receipt]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="lfp-fade fixed inset-0 z-[100] bg-slate-950/55 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          data-lfp-paused={motionPaused || undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          onOpenAutoFocus={(e) => {
            // Land on the heading, not the first stepper: reading the cart comes before changing it.
            e.preventDefault();
            (receipt ? receiptHeading : cartHeading).current?.focus();
          }}
          className="lfp-slide fixed inset-y-0 right-0 z-[101] flex w-full max-w-md flex-col border-l border-line bg-card-solid pb-[env(safe-area-inset-bottom)] text-fg shadow-modal outline-none"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden>
              {receipt ? <Receipt size={16} /> : <ShoppingBag size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title asChild>
                {receipt ? (
                  <h2 ref={receiptHeading} tabIndex={-1} className="text-base leading-tight font-bold outline-none">
                    Order placed (simulated)
                  </h2>
                ) : (
                  <h2 ref={cartHeading} tabIndex={-1} className="text-base leading-tight font-bold outline-none">
                    Your cart
                  </h2>
                )}
              </Dialog.Title>
              <p className="text-[11.5px] text-muted">
                {receipt
                  ? `Receipt ${receipt.number}`
                  : `${count} tee${count === 1 ? "" : "s"} · ${STORE.name}`}
              </p>
            </div>
            <Dialog.Close
              aria-label="Close cart"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted ring-1 ring-inset ring-line transition-colors outline-none hover:bg-elevated hover:text-fg focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X size={16} aria-hidden />
            </Dialog.Close>
          </header>

          {receipt ? (
            <ReceiptView receipt={receipt} onNewOrder={onNewOrder} />
          ) : lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
              <Image
                src="/merch-store/4a27cbbe-art.webp"
                alt=""
                width={1000}
                height={1000}
                sizes="9rem"
                className="lfp-bob h-36 w-36 rounded-3xl bg-white object-contain p-2 ring-1 ring-line"
              />
              <p className="max-w-xs text-[13.5px] leading-relaxed text-muted">{STORE.emptyCartCopy}</p>
              <Dialog.Close className="inline-flex h-11 items-center rounded-full bg-brand-600 px-5 text-[13px] font-bold text-white outline-none hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card-solid">
                Browse the critters
              </Dialog.Close>
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-line overflow-y-auto overscroll-contain px-4 sm:px-5">
                {lines.map(({ key, line, design, lineTotalCad }) => {
                  const label = `${design.productName}, ${COLOUR_LABEL[line.colour]}, ${line.size}`;
                  return (
                    <li key={key} className="lfp-rise flex gap-3 py-3.5">
                      <Image
                        src={design.images[line.colour]}
                        alt=""
                        width={PRODUCT_IMAGE_SIZE.width}
                        height={PRODUCT_IMAGE_SIZE.height}
                        sizes="4.5rem"
                        className="h-20 w-[4.5rem] shrink-0 rounded-xl object-cover ring-1 ring-line"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-bold leading-snug text-fg">{design.productName}</p>
                            <p className="mt-0.5 text-[11.5px] text-muted">
                              {COLOUR_LABEL[line.colour]} · Size {line.size} · {formatStoreCad(TEE_PRICE_CAD)} each
                            </p>
                          </div>
                          <button
                            ref={(node) => {
                              if (node) removeButtons.current.set(key, node);
                              else removeButtons.current.delete(key);
                            }}
                            type="button"
                            onClick={() => remove(key)}
                            aria-label={`Remove ${label}`}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle outline-none transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <QtyStepper
                            size="sm"
                            label={`Quantity of ${label}`}
                            value={line.qty}
                            onChange={(n) => onQty(key, n)}
                          />
                          <p className="font-mono text-[13px] font-bold tabular-nums text-fg">
                            {formatStoreCad(lineTotalCad)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <footer className="space-y-3 border-t border-line px-4 py-4 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-bold text-fg">
                    Subtotal <span className="font-medium text-subtle">(simulated)</span>
                  </p>
                  <p className="font-mono text-lg font-bold tabular-nums text-fg">{formatStoreCad(subtotalCad(cart))}</p>
                </div>
                <p className="text-[11.5px] leading-relaxed text-subtle">
                  Notional CAD prices. No payment is taken and nothing is shipped: checkout asks for nothing and prints a receipt for $0.00.
                </p>
                <button
                  type="button"
                  onClick={onCheckout}
                  className="lfp-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 text-sm font-bold text-white shadow-card-rest outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card-solid"
                >
                  <Receipt size={16} aria-hidden /> Check out (simulated)
                </button>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReceiptView({ receipt, onNewOrder }: { receipt: StoreReceipt; onNewOrder: () => void }) {
  const [headline, totalLine, ...footer] = STORE.checkoutCopy;
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain bg-elevated/70 px-4 py-5 sm:px-5">
      <p className="lfp-rise flex items-start gap-2 rounded-2xl bg-brand-50 px-3.5 py-3 text-[13px] font-semibold leading-snug text-brand-800 ring-1 ring-inset ring-brand-200">
        <PartyPopper size={17} className="lfp-wiggle mt-px shrink-0" aria-hidden />
        {headline}
      </p>

      {/* Thermal-tape look: zig-zag top and bottom edges come from a CSS mask,
          so the shadow is a drop-shadow on the wrapper — a box-shadow would be masked off. */}
      <div className="lfp-paper lfp-rise mx-auto mt-5 max-w-sm">
        <article
          aria-label={`Receipt ${receipt.number}`}
          className="lfp-receipt bg-card-solid px-5 py-7 font-mono text-[12px] leading-relaxed text-fg"
        >
          <p className="text-center text-[13px] font-bold uppercase tracking-[0.2em]">{STORE.name}</p>
          <p className="text-center text-[10.5px] text-muted">BioHubNet · Bay 3 · Pop-up till no. 37</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 border-y border-dashed border-line py-2 text-[11px]">
            <dt className="text-muted">Order</dt>
            <dd className="text-right font-bold">{receipt.number}</dd>
            <dt className="text-muted">Time</dt>
            <dd className="text-right">one incubation cycle ago</dd>
            <dt className="text-muted">Cashier</dt>
            <dd className="text-right">Lucky Cat-alyst (paw up)</dd>
          </dl>

          <ul className="mt-2 space-y-1.5">
            {receipt.lines.map(({ key, line, design, lineTotalCad }) => (
              <li key={key} className="flex gap-2">
                <span className="shrink-0 tabular-nums">{line.qty}×</span>
                <span className="min-w-0 flex-1">
                  {design.productName}
                  <span className="block text-[10.5px] text-muted">
                    {COLOUR_LABEL[line.colour]} · {line.size}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatStoreCad(lineTotalCad)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-0.5 border-t border-dashed border-line pt-2 tabular-nums">
            <div className="flex justify-between gap-3">
              <dt>Subtotal ({receipt.count} tee{receipt.count === 1 ? "" : "s"}, simulated)</dt>
              <dd>{formatStoreCad(receipt.subtotalCad)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-muted">
              <dt>Goodwill discount</dt>
              <dd>−{formatStoreCad(receipt.goodwillCad)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-muted">
              <dt>Tax (it&apos;s a simulation)</dt>
              <dd>{formatStoreCad(0)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-dashed border-line pt-1.5 text-[13px] font-bold">
              <dt>Total due</dt>
              <dd>{formatStoreCad(0)}</dd>
            </div>
          </dl>

          <ul className="mt-3 space-y-1.5 border-t border-dashed border-line pt-2 text-[11px] text-muted">
            {[totalLine, ...footer].map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {/* Autoclave-tape stripes, turned dark: the joke in the last line, drawn. */}
          <div aria-hidden className="lfp-tape mt-4 h-3 rounded-sm" />
          <p className="mt-3 text-center text-[10.5px] uppercase tracking-[0.25em] text-subtle">Thank you · pipette responsibly</p>
        </article>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex h-11 items-center rounded-full bg-brand-600 px-5 text-[13px] font-bold text-white outline-none hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card-solid"
        >
          Start a new order
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-subtle">{STORE.disclaimer}</p>
    </div>
  );
}
