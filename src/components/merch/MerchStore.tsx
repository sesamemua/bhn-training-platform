"use client";

/**
 * BHN Merch Store — the Lucky Flask Pop-Up storefront.
 *
 * One component for both doors: Workspace → Merch → BHN Merch Store and
 * the public /merch/store. It is a simulation (see src/lib/merch/store.ts):
 * no network calls, no forms, nothing sent. The only state that outlives
 * the tab is the cart, in this browser's localStorage, and the page works
 * the same when storage is blocked — the cart just starts empty.
 *
 * Motion is a little playful and all of it sits behind
 * prefers-reduced-motion: no-preference, so the reduced version is simply
 * the same page standing still.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Info, Pause, Play, ShoppingBag, Sparkles, Store } from "lucide-react";
import {
  ART_IMAGE_SIZE, BACK_ROOM, CART_STORAGE_KEY, COLOUR_LABEL, PRODUCT_IMAGE_SIZE, STORE,
  STORE_DESIGNS, TEE_COLOURS, TEE_PRICE_CAD, TEE_SIZES,
  addToCart, buildReceipt, cartCount, findDesign, formatStoreCad, lineKey, parseCart,
  qtyInCart, removeLine, setLineQty, teeAlt,
  type Cart, type StoreDesign, type StoreReceipt, type TeeColour, type TeeSize,
} from "@/lib/merch/store";
import { cn } from "@/lib/utils";
import { RadioPills } from "@/components/merch/StoreControls";
import { Swatch } from "@/components/merch/StoreSwatch";
import { StoreProductSheet, type AddResult } from "@/components/merch/StoreProductSheet";
import { StoreCartSheet } from "@/components/merch/StoreCartSheet";

export function MerchStore({
  railClassName = "top-0 scroll-mt-4",
}: {
  /**
   * Where the rail sticks. The public page sticks it to the very top; the
   * dashboard moves it below the Sidebar's fixed menu button.
   */
  railClassName?: string;
} = {}) {
  const [cart, setCart] = useState<Cart>([]);
  const [hydrated, setHydrated] = useState(false);
  const [colourBySlug, setColourBySlug] = useState<Record<string, TeeColour>>({});
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [receipt, setReceipt] = useState<StoreReceipt | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [bump, setBump] = useState(0);
  // The on-page way to stop the ticker, bob and swing (WCAG 2.2.2); reduced motion stops them anyway.
  const [motionPaused, setMotionPaused] = useState(false);

  // Read after mount, never during render: the server has no storage, and
  // reading it in render would make the first paint disagree with the HTML.
  // One read from an external store, once — the case the lint rule allows for.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (raw) setCart(parseCart(JSON.parse(raw)));
    } catch {
      /* blocked or corrupt storage: start with an empty cart */
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (cart.length === 0) window.localStorage.removeItem(CART_STORAGE_KEY);
      else window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* storage full or blocked: the cart still works for this visit */
    }
  }, [cart, hydrated]);

  // A second tab writes the same key. Follow it, so this tab's next change
  // does not quietly write back a cart the other tab has moved on from.
  // Writing the same value back fires no event, so this cannot ping-pong.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== null && e.key !== CART_STORAGE_KEY) return;
      try {
        if (e.storageArea !== window.localStorage) return;
        setCart(e.newValue ? parseCart(JSON.parse(e.newValue)) : []);
      } catch {
        /* blocked or corrupt storage: keep what this tab has */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Neither sheet has a Radix Trigger, so on close Radix has nowhere to send
  // focus and it falls to <body> — the top of the page. Remember the page
  // control that opened the sheet and go back to it instead.
  const openerRef = useRef<HTMLElement | null>(null);
  const rememberOpener = (el: HTMLElement | null) => {
    openerRef.current = el;
  };
  const returnFocus = useCallback((e: Event) => {
    e.preventDefault();
    // Only when focus was dropped: when the sheet hands over to the cart,
    // the cart heading already has it, and this runs a tick later.
    const a = document.activeElement;
    if (!a || a === document.body) openerRef.current?.focus();
  }, []);

  const count = cartCount(cart);
  const colourOf = useCallback((slug: string): TeeColour => colourBySlug[slug] ?? "white", [colourBySlug]);
  const setColour = (slug: string, colour: TeeColour) => setColourBySlug((cur) => ({ ...cur, [slug]: colour }));
  const active = activeSlug ? (findDesign(activeSlug) ?? null) : null;

  function add(design: StoreDesign, colour: TeeColour, size: TeeSize, qty: number): AddResult {
    const line = { slug: design.slug, colour, size, qty };
    const key = lineKey(line);
    // Computed from this render's cart, not in an updater, so the sheet
    // can say what happened straight away. One add per click, so it is current.
    const before = qtyInCart(cart, key);
    const next = addToCart(cart, line);
    const added = qtyInCart(next, key) - before;
    setCart(next);
    setReceipt(null);
    const what = `${design.productName}, ${COLOUR_LABEL[colour]}, size ${size}`;
    const total = cartCount(next);
    setAnnouncement(
      added > 0
        ? `Added to cart: ${added} × ${what}. ${total} tee${total === 1 ? "" : "s"} in the cart.`
        : `Not added: ${what} is already at the limit of 10.`,
    );
    if (added > 0) setBump((n) => n + 1);
    return { added, count: total };
  }

  function checkout() {
    if (cart.length === 0) return;
    const r = buildReceipt(cart);
    setReceipt(r);
    setCart([]);
    setAnnouncement(`Order placed, simulated. Receipt ${r.number}. Total due: $0.00.`);
  }

  function openCart() {
    setActiveSlug(null);
    setCartOpen(true);
  }

  return (
    <div className="lfp space-y-6" data-lfp-paused={motionPaused || undefined}>
      <style href="lucky-flask-pop-up" precedence="medium">{MOTION_CSS}</style>

      {/* Screen-reader echo of what just happened. Always rendered, so it is registered before it speaks. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ── Shopfront ─────────────────────────────────────────── */}
      <section aria-labelledby="lfp-title" className="overflow-hidden rounded-3xl border border-line bg-card">
        <div aria-hidden className="lfp-awning h-7" />
        <div aria-hidden className="lfp-scallop h-3.5" />
        <div className="grid items-center gap-6 px-4 pb-6 pt-3 sm:px-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-8 md:pb-8">
          <div className="min-w-0">
            <p className="inline-flex items-start gap-1.5 rounded-2xl bg-elevated px-2.5 py-1 text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.16em] text-muted">
              <Store size={12} className="mt-[3px] shrink-0 text-brand-500" aria-hidden />
              <span>Pop-up · Bay 3 · Open while the incubator is warm</span>
            </p>
            <h2 id="lfp-title" className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-fg sm:text-4xl lg:text-5xl">
              {STORE.name}
            </h2>
            <p className="mt-3 max-w-prose text-[14.5px] leading-relaxed text-muted">{STORE.tagline}</p>

            <p role="note" className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
              {STORE.disclaimer}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <a
                href="#lfp-rail"
                className="lfp-press inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-[13px] font-bold text-white shadow-card-rest outline-none transition-colors hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                <Sparkles size={15} aria-hidden /> Browse the critters
              </a>
              <CartButton
                count={count}
                bump={bump}
                onClick={(el) => {
                  rememberOpener(el);
                  openCart();
                }}
              />
            </div>

            <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
              {[
                [String(STORE_DESIGNS.length), "designs"],
                [String(TEE_COLOURS.length), "colours"],
                [`${TEE_SIZES[0]}–${TEE_SIZES[TEE_SIZES.length - 1]}`, "sizes"],
                [formatStoreCad(TEE_PRICE_CAD), "each, simulated (incubator temperature)"],
              ].map(([n, label]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-mono text-[15px] font-bold tabular-nums text-fg">{n}</dd>
                  <dd className="text-muted" aria-hidden>{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The mascot. The sign sits above the tile, never on the art. */}
          <div className="flex flex-col items-center">
            <div className="lfp-swing relative flex flex-col items-center" aria-hidden>
              <div className="flex w-24 justify-between px-3">
                <span className="h-4 w-px bg-line-strong" />
                <span className="h-4 w-px bg-line-strong" />
              </div>
              <span className="rounded-lg bg-brand-600 px-3 py-1 font-mono text-[11px] font-black uppercase tracking-[0.25em] text-white shadow-card-rest">
                Open · 37 °C
              </span>
            </div>
            <div className="mt-3 w-full max-w-[18rem] rounded-[2rem] bg-white p-3 shadow-card-rest ring-1 ring-line sm:max-w-[20rem]">
              <Image
                src={STORE.heroArt.src}
                alt={STORE.heroArt.alt}
                width={ART_IMAGE_SIZE.width}
                height={ART_IMAGE_SIZE.height}
                sizes="(min-width: 768px) 20rem, 18rem"
                preload
                className="lfp-bob h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ────────────────────────────────────────────── */}
      <div className="lfp-ticker flex items-center gap-2 rounded-2xl border border-line bg-elevated/60 py-1.5 pr-1.5">
        <div className="lfp-ticker-view min-w-0 flex-1 overflow-hidden py-1">
          <ul aria-label="Pop-up notices" className="lfp-ticker-track flex w-max items-center gap-8 px-4">
            {[...STORE.extraJokes, ...STORE.extraJokes].map((joke, i) => {
              const copy = i >= STORE.extraJokes.length;
              return (
                <li
                  key={`${i}-${joke}`}
                  aria-hidden={copy || undefined}
                  className={cn("flex shrink-0 items-center gap-2 text-[12.5px] font-semibold text-fg", copy && "lfp-dup")}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  {joke}
                </li>
              );
            })}
          </ul>
        </div>
        {/* Hover pauses for a mouse; this is the pause for everyone else.
            Hidden under reduced motion, where nothing moves to pause. */}
        <button
          type="button"
          onClick={() => setMotionPaused((p) => !p)}
          className="lfp-motion-toggle inline-flex h-9 shrink-0 items-center gap-1.5 self-center rounded-full bg-card-solid px-3 text-[11.5px] font-bold text-fg ring-1 ring-inset ring-line outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {motionPaused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
          {motionPaused ? "Play motion" : "Pause motion"}
        </button>
      </div>

      {/* ── Sticky counter ───────────────────────────────────── */}
      <div
        id="lfp-rail"
        className={cn(
          "sticky z-20 -mx-1 flex items-center justify-between gap-2 rounded-2xl border border-line bg-card-solid/90 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card-solid/75",
          railClassName,
        )}
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-fg">The rail</h3>
          <p className="text-[11.5px] text-muted">Tap a colour to preview it. Pick a size inside.</p>
        </div>
        <CartButton
          count={count}
          bump={bump}
          onClick={(el) => {
            rememberOpener(el);
            openCart();
          }}
          compact
        />
      </div>

      {/* ── Product grid ─────────────────────────────────────── */}
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {STORE_DESIGNS.map((d, i) => (
          <li key={d.slug} className="lfp-rise" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
            <ProductCard
              design={d}
              eager={i < 4}
              colour={colourOf(d.slug)}
              onColour={(c) => setColour(d.slug, c)}
              onOpen={(el) => {
                rememberOpener(el);
                setActiveSlug(d.slug);
              }}
            />
          </li>
        ))}
      </ul>

      {/* ── Back room ────────────────────────────────────────── */}
      <section aria-labelledby="lfp-backroom" className="rounded-3xl border border-dashed border-line bg-card px-4 py-5 sm:px-6">
        <h3 id="lfp-backroom" className="text-[15px] font-bold text-fg">Still incubating</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Out back, not on the rail yet. No tees, no cart button, just vibes.
        </p>
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:max-w-xl">
          {BACK_ROOM.map((a) => (
            <li key={a.src} className="text-center">
              <div className="rounded-2xl bg-white p-1.5 ring-1 ring-line">
                <Image
                  src={a.src}
                  alt={a.alt}
                  width={ART_IMAGE_SIZE.width}
                  height={ART_IMAGE_SIZE.height}
                  sizes="(min-width: 640px) 10rem, 30vw"
                  className="h-auto w-full opacity-90 grayscale-[35%]"
                />
              </div>
              <p className="mt-1.5 text-[11.5px] font-semibold leading-snug text-fg">{a.name}</p>
              <p className="text-[10.5px] text-subtle">Coming soon-ish</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-[11.5px] text-subtle">{STORE.disclaimer}</p>

      <StoreProductSheet
        design={active}
        colour={active ? colourOf(active.slug) : "white"}
        onColour={(c) => active && setColour(active.slug, c)}
        onDesign={(slug) => {
          // Carry the colour across, so flipping designs compares like with like.
          if (active) setColour(slug, colourOf(active.slug));
          setActiveSlug(slug);
        }}
        onClose={() => setActiveSlug(null)}
        onAdd={(size, qty) => (active ? add(active, colourOf(active.slug), size, qty) : { added: 0, count })}
        // No rememberOpener here: the card that opened the sheet is still the
        // way back, since this button leaves with the sheet.
        onOpenCart={openCart}
        onCloseAutoFocus={returnFocus}
      />

      <StoreCartSheet
        open={cartOpen}
        onOpenChange={(open) => {
          setCartOpen(open);
          if (!open) setReceipt(null);
        }}
        cart={cart}
        receipt={receipt}
        onQty={(key, qty) => setCart((c) => setLineQty(c, key, qty))}
        onRemove={(key) => {
          const gone = cart.find((l) => lineKey(l) === key);
          setCart((c) => removeLine(c, key));
          const d = gone && findDesign(gone.slug);
          if (gone && d) setAnnouncement(`Removed ${d.productName}, ${COLOUR_LABEL[gone.colour]}, size ${gone.size}.`);
        }}
        onCheckout={checkout}
        onNewOrder={() => {
          setReceipt(null);
          setCartOpen(false);
        }}
        onCloseAutoFocus={returnFocus}
        motionPaused={motionPaused}
      />
    </div>
  );
}

function CartButton({
  count,
  bump,
  onClick,
  compact = false,
}: {
  count: number;
  bump: number;
  /** Gets the button, so the cart can hand focus back to it. */
  onClick: (opener: HTMLElement) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      aria-label={`Open cart, ${count} tee${count === 1 ? "" : "s"}`}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-2 rounded-full bg-card-solid font-bold text-fg ring-1 ring-inset ring-line-strong outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand-500",
        compact ? "h-10 px-3.5 text-[12.5px]" : "h-11 px-4 text-[13px]",
      )}
    >
      <ShoppingBag size={compact ? 15 : 16} aria-hidden />
      Cart
      <span
        // Re-keyed on every add so the pop replays.
        key={bump}
        aria-hidden
        className={cn(
          "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-mono text-[11.5px] tabular-nums",
          count > 0 ? "lfp-pop bg-brand-600 text-white" : "bg-elevated text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ProductCard({
  design,
  eager,
  colour,
  onColour,
  onOpen,
}: {
  design: StoreDesign;
  /** The first row is above the fold on most screens; do not lazy-load it. */
  eager: boolean;
  colour: TeeColour;
  onColour: (colour: TeeColour) => void;
  /** Gets the "Pick a size" button, which is where focus returns on close. */
  onOpen: (opener: HTMLElement | null) => void;
}) {
  const pick = useRef<HTMLButtonElement>(null);
  return (
    <article className="lfp-card group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[box-shadow,transform,border-color] hover:border-brand-300 hover:shadow-card-hover">
      {/* A click on the photo opens the product too — a mouse nicety. Not a
          button: the keyboard already has "Pick a size", and the photo's alt
          text has to stay readable rather than hidden inside a duplicate. */}
      <div onClick={() => onOpen(pick.current)} className="cursor-pointer overflow-hidden bg-elevated/60">
        <Image
          key={design.images[colour]}
          src={design.images[colour]}
          alt={teeAlt(design, colour)}
          width={PRODUCT_IMAGE_SIZE.width}
          height={PRODUCT_IMAGE_SIZE.height}
          sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 26vw, 46vw"
          loading={eager ? "eager" : undefined}
          className="lfp-fade lfp-zoom h-auto w-full"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">{design.badge}</p>
        <h4 className="text-[14px] font-bold leading-snug text-fg sm:text-[15px]">{design.productName}</h4>
        <p className="hidden text-[12.5px] leading-relaxed text-muted sm:line-clamp-2">{design.blurb}</p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="font-mono text-[13.5px] font-bold tabular-nums text-fg">
            {formatStoreCad(TEE_PRICE_CAD)}
            <span className="ml-1 font-sans text-[10px] font-medium text-subtle">(simulated)</span>
          </p>
          <RadioPills
            label={`Colour for ${design.productName}`}
            options={TEE_COLOURS.map((c) => ({ value: c, label: COLOUR_LABEL[c] }))}
            value={colour}
            onChange={onColour}
            className="flex items-center gap-1"
            optionClassName={() => "inline-flex h-9 w-9 items-center justify-center rounded-full"}
            render={(o, checked) => (
              <Swatch colour={o.value} checked={checked} className={cn(checked && "ring-2 ring-brand-500")} />
            )}
          />
        </div>

        {/* The accessible name starts with the visible words, so "click Pick a size" works by voice.
            Hover is brand-700: Voltage recolours that one to cyan with dark text; its 600 stays at 4.48:1. */}
        <button
          ref={pick}
          type="button"
          onClick={(e) => onOpen(e.currentTarget)}
          className="lfp-press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-elevated text-[12.5px] font-bold text-fg ring-1 ring-inset ring-line outline-none transition-colors hover:bg-brand-700 hover:text-white hover:ring-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Pick a size<span className="sr-only"> for {design.productName}</span>
        </button>
      </div>
    </article>
  );
}

/**
 * Keyframes for the pop-up. Scoped under .lfp and only switched on for
 * people who have not asked for reduced motion. globals.css is left alone
 * on purpose: this is one page's personality, not a platform token.
 */
const MOTION_CSS = `
.lfp-awning{background:repeating-linear-gradient(90deg,var(--brand-600) 0 28px,rgba(255,255,255,.92) 28px 56px)}
.lfp-scallop{background:
  radial-gradient(circle at 14px 0,var(--brand-600) 13px,transparent 13.5px) 0 0/56px 100% repeat-x,
  radial-gradient(circle at 42px 0,rgba(255,255,255,.92) 13px,transparent 13.5px) 0 0/56px 100% repeat-x;
  filter:drop-shadow(0 2px 1px rgba(0,0,0,.08))}
.lfp-receipt{--z:9px;
  -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) 50%/calc(2*var(--z)) 51% repeat-x,
    conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) 50%/calc(2*var(--z)) 51% repeat-x;
  -webkit-mask-position:bottom,top;
  mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/calc(2*var(--z)) 51% repeat-x,
    conic-gradient(from 135deg at top,#0000,#000 1deg 89deg,#0000 90deg) top/calc(2*var(--z)) 51% repeat-x}
.lfp-paper{filter:drop-shadow(0 1px 1px rgba(0,0,0,.08)) drop-shadow(0 6px 14px rgba(0,0,0,.10))}
.lfp-tape{background:repeating-linear-gradient(135deg,#1f2937 0 8px,transparent 8px 16px),#f5e6b8}
.lfp-dup{display:none}
@media (prefers-reduced-motion: no-preference){
  @keyframes lfp-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  @keyframes lfp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
  @keyframes lfp-swing{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
  @keyframes lfp-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
  @keyframes lfp-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes lfp-fade{from{opacity:0}to{opacity:1}}
  @keyframes lfp-slide{from{transform:translateX(100%)}to{transform:none}}
  @keyframes lfp-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}
  .lfp-dup{display:flex}
  .lfp-ticker-view{-webkit-mask-image:linear-gradient(90deg,transparent,#000 1rem,#000 calc(100% - 1rem),transparent);mask-image:linear-gradient(90deg,transparent,#000 1rem,#000 calc(100% - 1rem),transparent)}
  .lfp-ticker-track{animation:lfp-marquee 38s linear infinite}
  .lfp-ticker:hover .lfp-ticker-track,.lfp-ticker:focus-within .lfp-ticker-track{animation-play-state:paused}
  [data-lfp-paused] .lfp-ticker-track,[data-lfp-paused] .lfp-bob,[data-lfp-paused] .lfp-swing{animation-play-state:paused}
  .lfp-bob{animation:lfp-bob 3.6s ease-in-out infinite}
  .lfp-swing{transform-origin:50% 0;animation:lfp-swing 4.2s ease-in-out infinite}
  .lfp-pop{animation:lfp-pop .45s cubic-bezier(.3,1.6,.5,1)}
  .lfp-rise{animation:lfp-rise .45s cubic-bezier(.2,.8,.2,1) both}
  .lfp-fade{animation:lfp-fade .25s ease-out both}
  .lfp-sheet{animation:lfp-rise .32s cubic-bezier(.2,.8,.2,1) both}
  .lfp-slide{animation:lfp-slide .3s cubic-bezier(.2,.8,.2,1) both}
  .lfp-wiggle{animation:lfp-wiggle .6s ease-in-out 2}
  .lfp-card:hover{transform:translateY(-3px)}
  .lfp-zoom{transition:transform .5s cubic-bezier(.2,.8,.2,1)}
  .lfp-card:hover .lfp-zoom{transform:scale(1.04)}
  .lfp-press:active{transform:scale(.97)}
}
@media (prefers-reduced-motion: reduce){
  .lfp-ticker-track{flex-wrap:wrap;width:auto;row-gap:.5rem}
  .lfp-ticker-track>li{flex-shrink:1;min-width:0}
  .lfp-motion-toggle{display:none}
}
`;
