/**
 * POST /api/admin/merch/cards — save a pasted product as a card.
 *
 * The body is what the person reviewed, not what the supplier said: the
 * lookup route drafts it, they choose the tier and write the notes, and
 * this stores the result. Saving publishes it — /merch is open.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugForAddition } from "@/lib/merch/board";
import { MERCH } from "@/lib/merch/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(2).max(160),
  tier: z.number().int().min(1).max(3),
  category: z.string().trim().min(1).max(60),
  pocketFlat: z.boolean().default(false),
  priceBreaks: z
    .array(z.object({ minQty: z.number().int().positive(), unitCad: z.number().nonnegative() }))
    .max(12)
    .default([]),
  decorationSetupCad: z.number().min(0).max(100_000).default(0),
  supplierProductName: z.string().trim().min(1).max(200),
  supplierItemCode: z.string().trim().min(1).max(40),
  productUrl: z.string().trim().url().max(500),
  imageUrl: z.string().trim().max(600).default(""),
  whyItWorks: z.string().trim().max(4_000).default(""),
  decoration: z.string().trim().max(2_000).default(""),
  watchOut: z.string().trim().max(2_000).default(""),
});

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the card — something is missing." }, { status: 400 });
  }
  const d = parsed.data;

  const tierKey = MERCH.tiers[String(d.tier)]?.key ?? "real-conversation";
  const units = d.priceBreaks.map((b) => b.unitCad);
  const itemId = slugForAddition(d.name, d.supplierItemCode);

  // Same product pasted twice is the same card, updated — not a duplicate.
  const card = await prisma.merchCard.upsert({
    where: { itemId },
    update: {
      ...d,
      tierKey,
      status: "shortlist",
      estUnitLowCad: units.length ? Math.min(...units) : 0,
      estUnitHighCad: units.length ? Math.max(...units) : 0,
    },
    create: {
      itemId,
      source: "added",
      status: "shortlist",
      ...d,
      tierKey,
      estUnitLowCad: units.length ? Math.min(...units) : 0,
      estUnitHighCad: units.length ? Math.max(...units) : 0,
      addedById: userId,
    },
    select: { itemId: true },
  });

  return NextResponse.json({ itemId: card.itemId }, { status: 201 });
}
