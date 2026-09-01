"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A supplier-hosted product photo, with a text fallback when it doesn't load.
 *
 * Shared by the internal board (/admin/workspace/merch) and the public
 * shortlist (/merch) so the fallback behaviour is defined once. The two
 * differ only in size and in what they are allowed to say: the internal
 * board falls back to the supplier's own product name, the public page to
 * the display name, because the supplier name is not published.
 *
 * Not hypothetical. Business Edge currently serves a corrupt file for the
 * B-Safe key touchless tool — nine stray bytes before the JPEG's FFD8 start
 * marker — which every browser refuses. Without this the public page shows a
 * broken-image icon and grey alt text to whoever was sent the link.
 */
export function ProductImage({
  src,
  alt,
  fallbackText,
  className,
  fallbackClassName,
}: {
  src: string;
  alt: string;
  /** Shown in place of the image. Defaults to `alt`. */
  fallbackText?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  /**
   * onError alone is not enough. The image starts loading while the server
   * HTML is parsed, which is before React hydrates and attaches the handler —
   * so an image that fails early (a hotlink block, or the corrupt file above)
   * fires its error event into nothing and would sit there as a broken icon
   * forever. Checking naturalWidth as the node attaches catches exactly that
   * case; onError covers everything after.
   */
  const check = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-elevated px-4 text-center",
          fallbackClassName,
        )}
      >
        <span className="text-[11px] font-medium leading-snug text-muted">
          {fallbackText ?? alt}
        </span>
      </div>
    );
  }

  return (
    /* Plain <img>, not next/image: the supplier host isn't in next.config
       remotePatterns, and next/image lazy-loads by default — the exact
       failure this needs to avoid.

       referrerPolicy="no-referrer" because these are hotlinked from Business
       Edge by design. Hotlink protection keys off the Referer header, so
       sending none is more likely to be served than announcing that a
       different domain is embedding their photo. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check}
      src={src}
      alt={alt}
      loading="eager"
      decoding="sync"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
