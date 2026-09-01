/**
 * Small, explicit attribution contract for campaign hand-offs.
 *
 * Values are kept first-party and are never treated as proof of a
 * conversion. Submission routes attach this object only after their own
 * database write succeeds.
 */
export const CAMPAIGN_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_source_platform",
  "utm_creative_format",
  "utm_marketing_tactic",
  "gclid",
  "gbraid",
  "wbraid",
] as const;

export type CampaignAttributionKey = (typeof CAMPAIGN_ATTRIBUTION_KEYS)[number];
export type CampaignAttribution = Partial<Record<CampaignAttributionKey, string>>;

export const CAMPAIGN_ATTRIBUTION_FORM_KEY = "__campaignAttribution";

const CLICK_ID_KEYS = new Set<CampaignAttributionKey>(["gclid", "gbraid", "wbraid"]);
const INTERNAL_BASE = "https://campaign.biohubnet.local";

function cleanValue(key: CampaignAttributionKey, value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const maxLength = CLICK_ID_KEYS.has(key) ? 512 : 240;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  return cleaned || null;
}

export function sanitizeCampaignAttribution(input: unknown): CampaignAttribution {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const clean: CampaignAttribution = {};
  for (const key of CAMPAIGN_ATTRIBUTION_KEYS) {
    const value = cleanValue(key, source[key]);
    if (value) clean[key] = value;
  }
  return clean;
}

export function campaignAttributionFromSearchParams(params: {
  get(name: string): string | null;
}): CampaignAttribution {
  const raw: Record<string, string> = {};
  for (const key of CAMPAIGN_ATTRIBUTION_KEYS) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  return sanitizeCampaignAttribution(raw);
}

export function campaignAttributionFromRecord(
  params: Record<string, string | string[] | undefined>,
): CampaignAttribution {
  return sanitizeCampaignAttribution(params);
}

export function parseCampaignAttribution(input: unknown): CampaignAttribution {
  if (typeof input !== "string") return sanitizeCampaignAttribution(input);
  try {
    return sanitizeCampaignAttribution(JSON.parse(input));
  } catch {
    return {};
  }
}

export function hasCampaignAttribution(attribution: CampaignAttribution): boolean {
  return CAMPAIGN_ATTRIBUTION_KEYS.some((key) => Boolean(attribution[key]));
}

export function appendCampaignAttribution(
  href: string,
  attribution: CampaignAttribution,
): string {
  if (!hasCampaignAttribution(attribution)) return href;
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(href);
  const url = new URL(href, INTERNAL_BASE);
  for (const key of CAMPAIGN_ATTRIBUTION_KEYS) {
    const value = attribution[key];
    if (value) url.searchParams.set(key, value);
  }
  return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard"): string {
  return value && /^\/(?!\/)/.test(value) ? value : fallback;
}

export function campaignAuthUrl(
  mode: "login" | "register",
  destination: string,
  attribution: CampaignAttribution,
): string {
  const callbackUrl = appendCampaignAttribution(safeInternalPath(destination), attribution);
  const authUrl = `/${mode}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return appendCampaignAttribution(authUrl, attribution);
}

export function campaignAttributionFromFormData(formData: unknown): CampaignAttribution {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) return {};
  return sanitizeCampaignAttribution(
    (formData as Record<string, unknown>)[CAMPAIGN_ATTRIBUTION_FORM_KEY],
  );
}

export function withCampaignAttribution<T extends Record<string, unknown>>(
  formData: T,
  attribution: CampaignAttribution,
): T {
  if (!hasCampaignAttribution(attribution)) return formData;
  return {
    ...formData,
    [CAMPAIGN_ATTRIBUTION_FORM_KEY]: sanitizeCampaignAttribution(attribution),
  };
}
