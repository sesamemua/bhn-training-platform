"use client";
/**
 * Tabs that live in the URL.
 *
 * In-page tabs used to be plain component state, so a refresh (or a link
 * sent to a colleague) always landed on the first tab. This keeps the
 * open tab in the query string (`?tab=calendar`): the page opens on it,
 * a refresh stays on it, and the address bar is a link to it.
 *
 * replaceState rather than a navigation: switching tabs doesn't re-run the
 * server page or add a Back-button entry per click.
 */
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

/** Set (or, with null, remove) one query parameter without navigating. */
export function setUrlParam(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Like useState for the open tab, read from and written to `?key=`.
 * `fallback` is the tab with no parameter (it's left out of the URL);
 * `valid` lists the allowed values or checks one.
 */
export function useTabParam<T extends string>(
  key: string,
  fallback: T,
  valid: readonly T[] | ((value: string) => boolean),
  initial?: T,
): [T, (next: T) => void] {
  const params = useSearchParams();
  const raw = params?.get(key) ?? null;
  const ok = (v: string | null): v is T => v !== null && (typeof valid === "function" ? valid(v) : (valid as readonly string[]).includes(v));
  const [value, setValue] = useState<T>(ok(raw) ? raw : initial ?? fallback);
  const set = useCallback((next: T) => {
    setValue(next);
    setUrlParam(key, next === fallback ? null : next);
  }, [key, fallback]);
  return [value, set];
}
