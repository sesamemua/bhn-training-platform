"use client";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/track";

// ponytail: a tab left open and visible overnight would count as hours;
// cap each flush at 30 min until we add idle detection.
const MAX_CHUNK_MS = 30 * 60 * 1000;

/**
 * Fires a page_view on every Next.js navigation, plus a page_time with the
 * visible-tab milliseconds spent on the previous path (flushed on route
 * change, tab hide and unload). Mounted once at the root.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const lastPath = useRef<string | null>(null);
  const timer = useRef<{ path: string; ms: number; since: number | null } | null>(null);

  useEffect(() => {
    const url = pathname + (search?.toString() ? `?${search.toString()}` : "");
    if (url === lastPath.current) return;
    lastPath.current = url;
    track("page_view", { path: pathname });
  }, [pathname, search]);

  useEffect(() => {
    if (timer.current?.path === pathname) return;
    flush(timer.current);
    timer.current = { path: pathname, ms: 0, since: document.visibilityState === "visible" ? Date.now() : null };
  }, [pathname]);

  useEffect(() => {
    const onVisibility = () => {
      const t = timer.current;
      if (!t) return;
      if (document.visibilityState === "hidden") flush(t);
      else if (t.since === null) t.since = Date.now();
    };
    const onHide = () => flush(timer.current);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return null;
}

function flush(t: { path: string; ms: number; since: number | null } | null) {
  if (!t) return;
  if (t.since !== null) {
    t.ms += Date.now() - t.since;
    t.since = document.visibilityState === "visible" ? Date.now() : null;
  }
  if (t.ms >= 1000) track("page_time", { path: t.path, ms: Math.min(Math.round(t.ms), MAX_CHUNK_MS) });
  t.ms = 0;
}
