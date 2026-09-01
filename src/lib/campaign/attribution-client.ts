"use client";

import {
  campaignAttributionFromSearchParams,
  hasCampaignAttribution,
  sanitizeCampaignAttribution,
  type CampaignAttribution,
} from "./attribution";

const STORAGE_KEY = "bhn-campaign-attribution-v1";

export function storeCampaignAttribution(attribution: CampaignAttribution): CampaignAttribution {
  const clean = sanitizeCampaignAttribution(attribution);
  if (typeof window === "undefined" || !hasCampaignAttribution(clean)) return clean;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {}
  return clean;
}

export function getCampaignAttribution(): CampaignAttribution {
  if (typeof window === "undefined") return {};

  const current = campaignAttributionFromSearchParams(new URLSearchParams(window.location.search));
  if (hasCampaignAttribution(current)) return storeCampaignAttribution(current);

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? sanitizeCampaignAttribution(JSON.parse(stored)) : {};
  } catch {
    return {};
  }
}
