/**
 * POST /api/admin/merch/lookup — read a Business Edge listing.
 *
 * Takes a link somebody pasted, returns a draft card for them to finish.
 * Writes nothing: the person reviews the pricing, picks a tier and writes
 * the notes before anything is saved, because /merch publishes all of it.
 *
 * The pasted URL is never fetched. Only the item code is taken out of it
 * (productCodeFromUrl rejects any host but the supplier's), and the URL
 * that is actually requested is built here from that code — so this
 * cannot be pointed at an arbitrary address.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { detailUrlFor, draftCardFrom, listingUrlFor, parseProductPage, productCodeFromUrl } from "@/lib/merch/supplier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ url: z.string().trim().min(1).max(500) });

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Paste a product link." }, { status: 400 });

  const code = productCodeFromUrl(parsed.data.url);
  if (!code) {
    return NextResponse.json(
      { error: "That does not look like a Business Edge product link. Open the product and copy the address bar." },
      { status: 400 },
    );
  }

  let html: string;
  try {
    const res = await fetch(detailUrlFor(code), {
      // The detail endpoint refuses a bare request; the listing is where
      // a browser would be coming from, and it is where the person is.
      headers: {
        Referer: listingUrlFor(code, "product"),
        "User-Agent": "BioHubNet merch board (one listing per paste)",
        Accept: "text/html",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Business Edge returned ${res.status} for ${code}.` }, { status: 502 });
    }
    html = await res.text();
  } catch {
    return NextResponse.json({ error: "Could not reach Business Edge. Try again in a moment." }, { status: 502 });
  }

  const product = parseProductPage(html);
  if (!product) {
    return NextResponse.json(
      { error: `Read the page for ${code} but could not find the product details on it.` },
      { status: 422 },
    );
  }

  return NextResponse.json({ draft: draftCardFrom(product) });
}
