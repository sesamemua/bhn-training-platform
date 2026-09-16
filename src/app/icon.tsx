/**
 * Favicon: the BioHubNet four-petal mark at 64×64 (the same geometry
 * as <LogoMark> in src/components/ui/Logo.tsx and
 * /public/biohubnet-logo.svg).
 *
 * WHY THIS SERVES STORED PNG BYTES INSTEAD OF DRAWING WITH next/og (Sep 2026)
 * Root metadata files are compiled into the server bundle of every page.
 * When this file imported `ImageResponse` from "next/og", every one of the
 * ~258 page functions traced @vercel/og. Through its optional
 * `import("sharp")`, that also pulled in sharp, libvips and sharp-wasm32,
 * about 15 MB compressed per page, all counted against Vercel Functions
 * Storage. The image never changes, so it is served from stored bytes.
 *
 * MARK_64_PNG (bottom of this file) is byte-for-byte what production served
 * from the ImageResponse version of this file (commit 7fc38bf6; 4,372
 * bytes, sha1 e9665025519b). The URL (/icon), size, content type
 * and headers are unchanged.
 *
 * The bytes live in this file rather than in a separate .png on purpose:
 * the route then depends on nothing but this tracked file, so no commit
 * can ship it without its image. Pages only load the `size` and
 * `contentType` exports (Turbopack splits them into a small metadata
 * chunk), so the string ships with /icon alone.
 *
 * To change the mark: render the new PNG once (for example with next/og
 * in a throwaway route, or export it from the SVG), then paste
 * `base64 -i new.png | fold -w 100` over MARK_64_PNG. Keep "next/og" and
 * any file reads out of this file.
 */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  // Buffer.from skips the line breaks inside the base64 text.
  return new Response(new Uint8Array(Buffer.from(MARK_64_PNG, "base64")), {
    headers: {
      // The same headers ImageResponse sent in production.
      "content-type": contentType,
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}

// prettier-ignore
const MARK_64_PNG = `
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
fwGqeIgAPyCUnwAAAABJRU5ErkJggg==
`;
