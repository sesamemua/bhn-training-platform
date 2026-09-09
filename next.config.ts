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
  // @napi-rs/canvas is here for the same reason as the rest, but the
  // symptom is specific: it loads a platform-specific native binding
  // (@napi-rs/canvas-darwin-arm64, -linux-x64-gnu, …) through an
  // optional dependency the bundler cannot trace, so bundling it fails
  // at runtime with "Cannot find native binding". It rasterises PDF
  // pages for the EQUIP reviewer annotator
  // (/api/admin/equip/applications/[id]/document/page).
  serverExternalPackages: ["unzipper", "archiver", "@prisma/client", "bcryptjs", "unpdf", "mammoth", "@napi-rs/canvas"],
  // /admin/security reads markdown files at runtime from docs/security/.
  // Without an explicit trace include, Vercel's file-tracing layer can
  // exclude content outside `app/` from the serverless function bundle,
  // making fs.readFileSync 404 in production. Pin the directory.
  // Vercel Functions Storage hit 93 GB against a 10 GB limit. Measured
  // from this repo's own build traces (.next/server/**/*.nft.json): 67.6 GB
  // traced across 720 bundles, 60.6 GB of it Prisma, ~85 MB of Prisma in
  // every single one of the 712 bundles that touch the database.
  //
  // Almost all of that is unreachable. Prisma ships the WASM query engine
  // AND query compiler for five SQL dialects, in both CJS and ESM, inside
  // @prisma/client/runtime. Nothing requires them: the generated client
  // sets `config.engineWasm = undefined` and `config.compilerWasm =
  // undefined` (node_modules/.prisma/client/index.js:3128-3129) because
  // this app uses the library engine, and grepping the whole Prisma tree
  // for these filenames returns nothing. They are generator templates that
  // Next's file tracer pulls in through the package's "files" field rather
  // than through any import.
  //
  // Two deliberate omissions, both about asymmetry — being over quota
  // costs money, breaking every database call costs the platform:
  //   • the `postgresql` pair stays. It is the provider that matches the
  //     datasource, and while the evidence says it is just as dead, a
  //     wrong call there takes down every route at once.
  //   • runtime/binary.* stays. It is dead only while the engine type is
  //     "library"; one env var (PRISMA_CLIENT_ENGINE_TYPE=binary) would
  //     make it load, and an exclude would then fail silently in prod.
  //
  // Do NOT add binaryTargets to prisma/schema.prisma to "help" here: a
  // second target generates a second 19 MB engine into every bundle.
  outputFileTracingExcludes: {
    "*": [
      // Four dialects this app will never speak. ~32 GB across a build.
      "node_modules/@prisma/client/runtime/query_engine_bg.cockroachdb.*",
      "node_modules/@prisma/client/runtime/query_engine_bg.mysql.*",
      "node_modules/@prisma/client/runtime/query_engine_bg.sqlite.*",
      "node_modules/@prisma/client/runtime/query_engine_bg.sqlserver.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.cockroachdb.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.mysql.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.sqlite.*",
      "node_modules/@prisma/client/runtime/query_compiler_bg.sqlserver.*",
      // Edge, browser and React Native variants. Every route here declares
      // runtime = "nodejs" (328 of them) and there is no middleware or
      // proxy, so those export conditions can never be selected.
      "node_modules/@prisma/client/runtime/wasm-engine-edge.*",
      "node_modules/@prisma/client/runtime/wasm-compiler-edge.*",
      "node_modules/@prisma/client/runtime/edge.js",
      "node_modules/@prisma/client/runtime/edge-esm.js",
      "node_modules/@prisma/client/runtime/react-native.js",
      "node_modules/@prisma/client/runtime/index-browser.*",
      "node_modules/.prisma/client/edge.js",
      // Declarations are never loaded at runtime. Next ignores **/*.d.ts
      // already but not .d.mts, which is why those were being traced.
      "node_modules/@prisma/client/runtime/*.d.ts",
      "node_modules/@prisma/client/runtime/*.d.mts",
      // Repo directories that no route traces. Note what is NOT here:
      // docs/ (docs/security is read at runtime), private/ (the AV clip
      // route reads it), public/, scripts/ and prisma/fixtures — each is
      // reachable, and an exclude beats an include, so listing any of them
      // would 404 a live page. That regression has happened here before;
      // the comment above outputFileTracingIncludes records it.
      "tests/**",
      "evals/**",
      "playwright/**",
      "test-results/**",
      "prisma/migrations/**",
      "docs/guides/**",
      "docs/plans/**",
      "docs/ux/**",
      "samples/**",
      "backups/**",
      "mcp/**",
      ".gitnexus/**",
    ],
  },
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
