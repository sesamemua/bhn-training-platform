/**
 * One page of an EQUIP attachment, rasterised to PNG for the reviewer
 * annotator.
 *
 *   GET .../document/page?key=…&page=2   → image/png
 *   GET .../document/page?key=…&meta=1   → { pageCount }
 *
 * Why the server draws it
 *   Pinning a comment to a spot on a page needs an element with known
 *   bounds. A PDF in an <iframe> has none — the browser plugin exposes
 *   no DOM. Rendering pdf.js in the CLIENT was tried first and its
 *   render() call hangs in unpdf's bundled build (getOperatorList
 *   resolves, render never does), and that build also ships no
 *   standard-font data, so base-14 PDFs came out as blank white pages.
 *   Rasterising here sidesteps both, keeps ~1.6 MB of pdf.js out of the
 *   client bundle, and makes a PDF page and an uploaded image the same
 *   thing to the viewer: an <img> with pins on top.
 *
 * The upload is never modified — this reads it and returns a picture of
 * it. Nothing is written back to R2.
 */
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import type { EquipDocument } from "@/lib/equip/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Guards a malicious or fat-fingered ?page= from asking us to
 *  rasterise the 900th page of a 3-page file. */
const MAX_PAGE = 500;

async function loadBytes(key: string): Promise<Uint8Array | null> {
  if (!r2) return null;
  const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (!res.Body) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) return new NextResponse("Forbidden", { status: 403 });
  if (!r2) return new NextResponse("R2 not configured", { status: 503 });

  const { id } = await params;
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return new NextResponse("key required", { status: 400 });

  // The key must be on THIS application — otherwise an authenticated
  // reviewer could render any object in the bucket they can name.
  const app = await prisma.equipApplication.findUnique({
    where: { id },
    select: { documents: true },
  });
  if (!app) return new NextResponse("Not found", { status: 404 });
  const docs = (app.documents as unknown as EquipDocument[]) ?? [];
  const doc = docs.find((d) => d.key === key);
  if (!doc) return new NextResponse("Not in application", { status: 404 });

  const isPdf = doc.contentType === "application/pdf" || /\.pdf$/i.test(doc.name);
  if (!isPdf) return new NextResponse("Not a PDF", { status: 400 });

  try {
    const bytes = await loadBytes(key);
    if (!bytes) return new NextResponse("Empty", { status: 404 });

    if (url.searchParams.get("meta") === "1") {
      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      return NextResponse.json({ pageCount: pdf.numPages });
    }

    const requested = Number(url.searchParams.get("page") ?? "1");
    const page = Number.isFinite(requested)
      ? Math.min(MAX_PAGE, Math.max(1, Math.floor(requested)))
      : 1;

    const { renderPageAsImage } = await import("unpdf");
    const png = await renderPageAsImage(bytes, page, {
      // 2× a 612pt page ≈ 1224px — sharp when the viewer scales it to
      // whatever width the panel is, without rendering a poster.
      scale: 2,
      canvasImport: () => import("@napi-rs/canvas"),
    });

    return new NextResponse(png as ArrayBuffer, {
      headers: {
        "Content-Type": "image/png",
        // Private: it's someone's application. Cached hard anyway —
        // the bytes behind a (key, page) never change, and re-rendering
        // on every pin click would be silly.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[equip] page render failed", { id, key, err });
    return new NextResponse("Could not render that page", { status: 500 });
  }
}
