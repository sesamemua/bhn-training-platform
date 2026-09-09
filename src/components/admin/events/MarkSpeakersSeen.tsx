"use client";
/**
 * Marks an event's speaker submissions as seen — from the browser, once
 * the page is on screen. Renders nothing.
 *
 * Rendering the page must not do this. A GET runs for prefetches, tour
 * previews and link checks too, so a server-side write would clear the
 * badge for everyone the moment anything fetched the page. A person's
 * browser, with the tab visible, running this effect is the only signal
 * that a person looked; a background tab waits until it is looked at.
 *
 * After the write, refresh the server tree so the sidebar badge drops
 * without a reload.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MarkSpeakersSeen({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    let done = false;
    const send = () => {
      if (done) return;
      done = true;
      fetch(`/api/admin/speakers/${encodeURIComponent(slug)}/seen`, { method: "POST" })
        .then((r) => { if (r.ok) router.refresh(); })
        .catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === "visible") send(); };
    if (document.visibilityState === "visible") send();
    else document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [slug, router]);
  return null;
}
