import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly. Without this, Turbopack's root
  // inference walks up from cwd looking for the nearest lockfile and can
  // land on an unrelated ancestor directory if one happens to exist above
  // the repo (e.g. a stray lockfile in $HOME) — silently resolving
  // node_modules from the wrong place and breaking `next dev`.
  turbopack: {
    root: __dirname,
  },
  // ── HTTP security headers (OWASP A05 hardening, May 2026) ───────
  // Applied to every route via a catch-all source pattern.
  // X-Frame-Options: SAMEORIGIN — clickjacking protection that still
  //   allows the LMS to embed its OWN pages in iframes. The SCORM
  //   pipeline absolutely needs this:
  //       /player/[courseId]  →  iframes /scorm-loader.html
  //                            →  iframes /scorm-files/<courseId>/...
  //   Using DENY (the previous value) blocked every one of those
  //   same-origin iframe loads, presenting to the user as
  //   "bhn-training-platform.vercel.app refused to connect" inside
  //   the player chrome. SAMEORIGIN keeps the clickjacking guarantee
  //   (no other origin can frame us) while unblocking our own.
  // X-Content-Type-Options: nosniff — stops browsers from MIME-sniffing
  //   a response away from the declared Content-Type.
  // Referrer-Policy: strict-origin-when-cross-origin — sends the full
  //   URL for same-origin requests; only the origin for cross-origin
  //   ones; nothing on downgrades (https → http).
  // Permissions-Policy — opt out of powerful browser features. Camera and
  //   geolocation stay fully disabled; microphone is allowed on our OWN
  //   origin (self) for the Mock Interview voice answers, while still blocked
  //   for any third-party iframe.
  /*
   * The 2026 event's slug used to say 2025.
   *
   * It was renamed because the number is in every public URL for it —
   * the landing page, registration, the attendee dashboard, the .ics
   * feed, and the speaker-intake link that goes out to invited
   * speakers. The old URL keeps working: links already sent, the
   * onboarding tour, and biohubnet.ca's own link into the platform
   * must not break because we tidied a number.
   *
   * NOT permanent. A 308 is cached by browsers effectively for ever,
   * and an event slug is the kind of thing somebody may want to put
   * back. A temporary redirect costs nothing here — the pages are not
   * competing for search ranking — and stays reversible.
   */
  async redirects() {
    return [
      {
        source: "/events/2025-annual-symposium",
        destination: "/events/2026-annual-symposium",
        permanent: false,
      },
      {
        source: "/events/2025-annual-symposium/:path*",
        destination: "/events/2026-annual-symposium/:path*",
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "X-Frame-Options",          value: "SAMEORIGIN" },
          { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",       value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
      // /scorm-loader.html — make it uncacheable. Browsers don't
      // reliably re-evaluate X-Frame-Options on conditional 304
      // revalidation for iframe targets, so any user whose browser
      // cached the old loader (when the global header was DENY)
      // continues to see "refused to connect" even after the
      // server-side fix shipped. `no-store` forces a fresh response
      // on every iframe load, side-stepping that class of cache
      // staleness permanently. The loader is ~10 KB so the byte cost
      // of skipping cache is negligible.
      {
        source: "/scorm-loader.html",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
  serverExternalPackages: ["unzipper", "archiver", "@prisma/client", "bcryptjs", "unpdf", "mammoth"],
  // /admin/security reads markdown files at runtime from docs/security/.
  // Without an explicit trace include, Vercel's file-tracing layer can
  // exclude content outside `app/` from the serverless function bundle,
  // making fs.readFileSync 404 in production. Pin the directory.
  outputFileTracingIncludes: {
    "/admin/security": ["./docs/security/**/*"],
    // Same reason: the AV clip route reads PNGs from private/av-clips/ at
    // runtime. They are outside app/, so without this the route 404s in
    // production while working perfectly in dev.
    "/api/admin/symposium-av/clip/[file]": ["./private/av-clips/**/*"],
  },
  images: {
    remotePatterns: [
      // Cloudflare R2 public dev URL and any custom-domain bucket.
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
  // Inlined at build time so the sidebar can show a short SHA to staff.
  // Vercel sets VERCEL_GIT_COMMIT_SHA automatically; empty string locally.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
};

export default nextConfig;
