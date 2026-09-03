"use client";

import { isMarketingAllowed } from "@/components/consent/ConsentProvider";

export type GoogleAdsProgram = "engage" | "experience" | "venture_connect";

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() ?? "";

const CONVERSION_LABELS: Record<GoogleAdsProgram, string> = {
  engage: process.env.NEXT_PUBLIC_GOOGLE_ADS_ENGAGE_LABEL?.trim() ?? "",
  experience: process.env.NEXT_PUBLIC_GOOGLE_ADS_EXPERIENCE_LABEL?.trim() ?? "",
  venture_connect:
    process.env.NEXT_PUBLIC_GOOGLE_ADS_VENTURE_CONNECT_LABEL?.trim() ?? "",
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function buildGoogleAdsSendTo(id: string, label: string): string | null {
  const normalizedId = id.trim();
  const normalizedLabel = label.trim();
  if (!/^AW-\d+$/.test(normalizedId) || !normalizedLabel) return null;
  return `${normalizedId}/${normalizedLabel}`;
}

export function googleAdsSendTo(program: GoogleAdsProgram): string | null {
  return buildGoogleAdsSendTo(GOOGLE_ADS_ID, CONVERSION_LABELS[program]);
}

/** Queue a primary Google Ads conversion after the server confirms submission. */
export function trackGoogleAdsConversion(program: GoogleAdsProgram): void {
  if (typeof window === "undefined" || !isMarketingAllowed()) return;
  const sendTo = googleAdsSendTo(program);
  if (!sendTo || typeof window.gtag !== "function") return;
  window.gtag("event", "conversion", { send_to: sendTo });
}

export function googleAdsId(): string | null {
  return /^AW-\d+$/.test(GOOGLE_ADS_ID) ? GOOGLE_ADS_ID : null;
}
