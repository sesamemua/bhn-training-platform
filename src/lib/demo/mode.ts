/**
 * Demo deployment mode.
 *
 * The public portfolio demo (bhn-demo Vercel project) is the SAME codebase
 * as production with one env difference: NEXT_PUBLIC_DEMO_MODE=true and its
 * own database. Everything demo-specific gates on this predicate, so on
 * production — where the variable is absent — none of it exists: /demo 404s,
 * the entry API refuses, the sidebar strip doesn't render, robots stay open.
 *
 * NEXT_PUBLIC_ deliberately: the sidebar indicator is a client component,
 * and public env vars are readable on both sides. Nothing secret lives in
 * a boolean.
 */
export function demoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

/**
 * Accept only a local absolute path for post-sign-in redirects — never a
 * full URL, protocol-relative value, or anything with characters outside
 * printable ASCII. Shared by /api/demo/enter and /sandbox/[token] so the
 * two can't drift into an open redirect.
 */
export function safeLocalPath(v: string | null | undefined): string | null {
  return v && /^\/(?!\/)[\x20-\x7e]*$/.test(v) ? v : null;
}
