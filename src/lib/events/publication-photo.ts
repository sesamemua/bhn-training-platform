import { createHash } from "node:crypto";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL, R2_PUBLIC_URL_PREFIXES } from "@/lib/r2";
import { HttpsUrl, PUBLICATION_EVENT } from "./people-publication";

const MAX_BYTES = 5 * 1024 * 1024;
export function publicationPhotoSource(value: string): URL {
  const parsed = HttpsUrl.parse(value);
  const url = new URL(parsed);
  const trusted = R2_PUBLIC_URL_PREFIXES.some((base) => {
    const root = new URL(base);
    const prefix = root.pathname.replace(/\/$/, "") + "/";
    const key = url.pathname.slice(prefix.length);
    return url.origin === root.origin && url.pathname.startsWith(prefix)
      && (key.startsWith("speakers/") || key.startsWith("people-publication/"));
  });
  const website = ["biohubnet.ca", "www.biohubnet.ca"].includes(url.hostname) && url.pathname.startsWith("/wp-content/uploads/");
  if (!trusted && !website) throw new Error("Use a BioHubNet uploaded headshot or a biohubnet.ca media-library image.");
  return url;
}

export function publicationImageType(bytes: Buffer): { mime: string; ext: string } {
  if (bytes.length >= 12 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 12 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  throw new Error("The headshot must be a JPEG, PNG or WebP image.");
}

/** Copy bytes, not a mutable URL. This namespace is separate from speaker cleanup. */
export async function freezePublicationPhoto(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (!R2_PUBLIC_URL) throw new Error("Publication image storage is not configured.");
  const url = publicationPhotoSource(value);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Couldn't read that headshot. Check the source image.");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Headshot must be under 5 MB.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      length += chunk.length;
      if (length > MAX_BYTES) throw new Error("Headshot must be under 5 MB.");
      chunks.push(chunk);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  const type = publicationImageType(bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const key = `people-publication/${PUBLICATION_EVENT}/${hash}.${type.ext}`;
  await putR2Object(key, bytes, type.mime);
  return r2PublicUrl(key);
}
