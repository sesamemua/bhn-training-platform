/** Shared validation between the public showcase submit route and the
 *  admin manual-add route, so both accept exactly the same photo/LinkedIn
 *  rules. */

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function photoExtFor(contentType: string): string {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

/** Normalise whatever the user typed into a canonical
 *  https://www.linkedin.com/in/<slug>/ URL.
 *
 *  Deliberately forgiving, because the alternative to being forgiving
 *  here is sending people to a web search to find their own profile —
 *  and a search engine can decide at any moment that the person is a
 *  bot and show them a challenge instead. Nothing we can do about that
 *  from our side. What we can do is accept whatever they arrive with.
 *
 *  Handles:
 *   • "foo" / "@foo"                          → linkedin.com/in/foo
 *   • "linkedin.com/in/foo"                   → https://www.linkedin.com/in/foo/
 *   • "https://ca.linkedin.com/in/foo/"       → regional subdomains
 *   • "…/in/foo?utm_source=share&…"           → the mobile app's share link
 *   • "…/mwlite/in/foo"                       → LinkedIn's mobile web
 *   • "Here's my profile: https://…/in/foo"   → a URL inside pasted text
 *   • "/in/andré"                             → non-Latin slugs
 *  Returns null when we can't extract a plausible slug. */
export function normaliseLinkedin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  /*
   * People paste more than a URL — the app's share sheet writes a whole
   * sentence around it. Take the first LinkedIn URL out of whatever
   * arrived rather than refusing the lot.
   *
   * Two things this pattern has to get right.
   *
   * The host part is [^\s/]* and not \S*. With \S* the star is
   * unbounded and sits before a literal, so every "http://" in the
   * input is a fresh start position that scans to the end of the string
   * and backtracks — quadratic. Measured on the real function before
   * this was tightened: 25 KB of "http://" took 58 ms, 200 KB took
   * 3.9 s, and this runs on a public unauthenticated endpoint on a
   * single-threaded runtime. A host cannot contain a slash anyway.
   *
   * And the trailing punctuation is cut off, because \S* otherwise eats
   * the full stop that ends the sentence — and "." is legal in a slug
   * (jane.doe), so it survives all the way into the stored URL as
   * /in/jane-doe./ and 404s. The green "Reads as" line under the field
   * would show it as a trailing dot that looks like the sentence's own.
   */
  const embedded = trimmed.match(/https?:\/\/[^\s/]*linkedin\.com\/\S*/i);
  const candidate = embedded
    ? embedded[0].replace(/[.,;:!?)\]}>'"«»„“”‘’]+$/, "")
    : trimmed;

  try {
    const u = new URL(candidate.match(/^https?:\/\//) ? candidate : `https://${candidate}`);
    // Exact host or a real subdomain. `endsWith("linkedin.com")` would
    // also accept notlinkedin.com, which is somebody else's domain.
    if (u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")) {
      const m = u.pathname.match(/^(?:\/mwlite)?\/in\/([^/?#]+)/i);
      return m ? canonical(m[1]) : null;
    }
    // A URL, but not LinkedIn's. Do not quietly treat it as a handle.
    if (embedded || /^https?:\/\//.test(trimmed) || trimmed.includes("/")) return null;
  } catch { /* not a URL — fall through to the bare-handle case */ }

  return canonical(trimmed.replace(/^@/, ""));
}

/** One slug, decoded once and re-encoded, so what we store is always a
 *  well-formed URL whatever spelling it arrived in. */
function canonical(slug: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug; // malformed percent-escape; take it literally
  }
  /*
   * Reject what cannot be in a path segment, rather than allow-listing
   * the characters a handle may contain.
   *
   * The allow-list version was [\p{L}\p{N}\-._], which passed accented
   * and CJK names but refused a real profile whose handle begins with a
   * Canadian flag: a regional indicator is \p{S}, a Symbol, and neither
   * a letter nor a number. People put emoji in these. Whatever survives
   * here is encodeURIComponent'd below, so an unusual character is a
   * spelling question, not a safety one.
   */
  if (decoded.length < 2 || decoded.length > 100) return null;
  if (/[\s/?#@\\]/.test(decoded)) return null;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
  /*
   * At least one character with actual content. Without this, ".."
   * passes and becomes linkedin.com/in/../ — a URL that resolves to
   * LinkedIn's front page and is stored as if it were somebody's
   * profile. Symbols count, which is what lets the flag through.
   */
  if (!/[\p{L}\p{N}\p{S}]/u.test(decoded)) return null;
  return `https://www.linkedin.com/in/${encodeURIComponent(decoded)}/`;
}
