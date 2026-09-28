import { isIP } from "node:net";
import type { PrismaClient } from "@prisma/client";
import { R2_PUBLIC_URL_PREFIXES } from "@/lib/r2";

export function canRenderSocialLogo(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const trustedHosts = R2_PUBLIC_URL_PREFIXES.map((prefix) => new URL(prefix).host);
    return parsed.protocol === "https:" && !isIP(parsed.hostname) && (
      trustedHosts.includes(parsed.host) ||
      parsed.hostname.endsWith(".r2.dev") ||
      parsed.hostname.endsWith(".blob.vercel-storage.com") ||
      parsed.hostname === "logo.clearbit.com"
    );
  } catch {
    return false;
  }
}

export function normalizeOrganization(name: string): string {
  return name.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(incorporated|inc|ltd|limited|corp|corporation)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function logoOverride(spec: unknown): string | null {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null;
  const url = (spec as Record<string, unknown>).companyLogoUrl;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/** Prefer the event's approved partner logo, then an existing real employer profile. */
export async function findCompanyLogo(
  prisma: PrismaClient,
  eventId: string,
  organization: string | null,
): Promise<string | null> {
  if (!organization?.trim()) return null;
  const normalized = normalizeOrganization(organization);
  const sponsors = await prisma.sponsor.findMany({
    where: { eventId, logoUrl: { not: null } },
    select: { name: true, logoUrl: true },
  });
  const sponsor = sponsors.find((item) => normalizeOrganization(item.name) === normalized);
  if (sponsor?.logoUrl && canRenderSocialLogo(sponsor.logoUrl)) return sponsor.logoUrl;

  const company = await prisma.company.findFirst({
    where: { kind: "real", name: { equals: organization, mode: "insensitive" }, logo: { not: null } },
    select: { logo: true },
  });
  return company?.logo && canRenderSocialLogo(company.logo) ? company.logo : null;
}
