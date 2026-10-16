"use client";

import { isAnalyticsAllowed } from "@/components/consent/ConsentProvider";

const SESSION_KEY = "bhn-anon-session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) + "-" + Date.now();
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "";
  }
}

interface EventPayload {
  name: string;
  path?: string;
  referrer?: string;
  props?: Record<string, unknown>;
  sessionId?: string;
}

/**
 * Fire an analytics event. Never throws, never blocks. Uses sendBeacon
 * when available so the request still goes out on page unload.
 */
export function track(name: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  // GDPR/CCPA: only fire client analytics if the user has opted in.
  if (!isAnalyticsAllowed()) return;
  const payload: EventPayload = {
    name,
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || undefined,
    props,
    sessionId: getSessionId(),
  };
  send(JSON.stringify(payload));
}

/**
 * Page visits / visible time for the user's own dashboard shortcuts. A site
 * feature rather than analytics, so it runs without analytics consent: with
 * consent it is the normal page_view / page_time event; without, a bare
 * shortcut_* event (no session id, referrer or device) that the server keeps
 * only for signed-in users.
 */
export function trackUsage(kind: "view" | "time", props: { path: string; ms?: number }) {
  if (typeof window === "undefined") return;
  if (isAnalyticsAllowed()) return track(`page_${kind}`, props);
  send(JSON.stringify({ name: kind === "view" ? "shortcut_visit" : "shortcut_time", props }));
}

function send(body: string) {
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track", blob);
      return;
    }
  } catch {}
  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
