/**
 * biohubnet.ca traffic from Google Analytics 4 (the site's tag is
 * G-KZYDZJJNJW): visitors, sessions and page views for the last 7 full
 * days against the 7 before, and the most-viewed pages.
 *
 * Read with the GA4 Data API as a service account, signed here with
 * node:crypto rather than a Google SDK. Needs two environment variables:
 *
 *   GA4_PROPERTY_ID           the property's number (GA4 → Admin → Property details)
 *   GA4_SERVICE_ACCOUNT_JSON  the service account's JSON key, whole
 *
 * and that account added as a Viewer on the property. Without them the
 * dashboard says how to connect instead of showing numbers.
 */
import { createSign } from "node:crypto";

export interface SiteTotals {
  users: number;
  sessions: number;
  views: number;
}

export type SiteMetrics =
  | { connected: false }
  | { connected: true; error?: string; current?: SiteTotals; previous?: SiteTotals; topPages?: { path: string; views: number }[] };

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");

/** A signed JWT asking Google for read-only Analytics access. Pure apart from the signing. */
export function serviceAccountJwt(sa: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key, "base64url");
  return `${head}.${claim}.${signature}`;
}

interface Report {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;

/** Users, sessions and views per date range, from a report run over two ranges. */
export function parseTotals(report: Report): { current: SiteTotals; previous: SiteTotals } {
  const by = new Map<string, SiteTotals>();
  for (const row of report.rows ?? []) {
    const [users, sessions, views] = (row.metricValues ?? []).map((m) => num(m.value));
    by.set(row.dimensionValues?.[0]?.value ?? "", { users, sessions, views });
  }
  const zero = { users: 0, sessions: 0, views: 0 };
  return { current: by.get("date_range_0") ?? zero, previous: by.get("date_range_1") ?? zero };
}

export function parseTopPages(report: Report): { path: string; views: number }[] {
  return (report.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? "",
    views: num(row.metricValues?.[0]?.value),
  }));
}

export async function siteMetrics(): Promise<SiteMetrics> {
  const property = process.env.GA4_PROPERTY_ID?.trim();
  const key = process.env.GA4_SERVICE_ACCOUNT_JSON?.trim();
  if (!property || !key) return { connected: false };
  try {
    const sa = JSON.parse(key) as ServiceAccount;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountJwt(sa) }),
      signal: AbortSignal.timeout(8000),
    });
    const token = ((await tokenRes.json()) as { access_token?: string; error_description?: string });
    if (!token.access_token) return { connected: true, error: token.error_description ?? "Google refused the service account key." };

    const report = async (body: object): Promise<Report> => {
      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const j = (await res.json()) as Report & { error?: { message?: string } };
      if (!res.ok) throw new Error(j.error?.message ?? `Google Analytics answered ${res.status}.`);
      return j;
    };
    const lastWeek = { startDate: "7daysAgo", endDate: "yesterday" };
    const [totals, pages] = await Promise.all([
      report({
        dateRanges: [lastWeek, { startDate: "14daysAgo", endDate: "8daysAgo" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
      }),
      report({
        dateRanges: [lastWeek],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5,
      }),
    ]);
    return { connected: true, ...parseTotals(totals), topPages: parseTopPages(pages) };
  } catch (e) {
    return { connected: true, error: (e as Error).message };
  }
}
