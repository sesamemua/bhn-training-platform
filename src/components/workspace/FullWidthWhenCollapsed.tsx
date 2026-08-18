"use client";

/**
 * Marks the page as one that wants the whole window once the sidebar is
 * collapsed. Renders nothing.
 *
 * The obvious version of this was a CSS `:has()` rule on the layout
 * container. It was dropped at build time — Lightning CSS removes
 * selectors it cannot guarantee for the browser targets, and the built
 * stylesheet came out byte-identical with the rule absent, which is a
 * silent failure worth avoiding by construction. An attribute on <html>
 * needs no selector support beyond an attribute match, and it is
 * explicit about which page asked.
 */
import { useEffect } from "react";

export function FullWidthWhenCollapsed() {
  useEffect(() => {
    document.documentElement.dataset.wide = "1";
    return () => { delete document.documentElement.dataset.wide; };
  }, []);
  return null;
}
