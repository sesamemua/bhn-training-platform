/**
 * Where a registration came from: the IP address it was sent from and the
 * area Vercel places that address in (its own geolocation headers — no
 * outside lookup service). Stored with the answers as `__origin`, so a
 * coordinator can see "Toronto, ON, CA" next to a registrant — and notice
 * when someone who says they are in Ontario registered from elsewhere.
 *
 * An IP address locates a network, not a person: a VPN, a phone on mobile
 * data or a university proxy can put someone far from where they are.
 *
 * Pure: takes request headers, returns plain data.
 */
export interface Origin {
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postal: string | null;
  timezone: string | null;
}

const clean = (v: string | null) => {
  if (!v) return null;
  try { v = decodeURIComponent(v); } catch { /* as sent */ }
  v = v.trim();
  return v ? v.slice(0, 120) : null;
};

export function originFrom(h: Pick<Headers, "get">): Origin {
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
  return {
    ip: clean(ip),
    city: clean(h.get("x-vercel-ip-city")),
    region: clean(h.get("x-vercel-ip-country-region")),
    country: clean(h.get("x-vercel-ip-country")),
    postal: clean(h.get("x-vercel-ip-postal-code")),
    timezone: clean(h.get("x-vercel-ip-timezone")),
  };
}

/** "Toronto, ON, CA" — or null when nothing is known. */
export const placeOf = (o: Partial<Origin> | null | undefined) =>
  o ? [o.city, o.region, o.country].filter(Boolean).join(", ") || null : null;

/** The first three characters of a Canadian postal code (a letter, a digit, a letter), or null. */
export function postcodePrefix(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 3);
  return /^[A-Z]\d[A-Z]$/.test(s) ? s : null;
}
