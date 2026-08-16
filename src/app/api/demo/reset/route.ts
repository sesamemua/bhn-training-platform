/**
 * /api/demo/reset — nightly restore of the demo world.
 *
 * Vercel cron (demo project only — the cron entry is patched into
 * vercel.json by scripts/deploy-demo.sh, never committed to main, because
 * production already sits at the Hobby plan's two-cron cap) hits this every
 * morning so a hiring manager always lands on a pristine demo no matter
 * what yesterday's visitors did to it.
 *
 * Three guards, in order:
 *   1. demoMode() — on production the flag is absent and this route 404s
 *      before touching auth or the database. Deploying it there is inert.
 *   2. CRON_SECRET — Vercel sends "Authorization: Bearer <CRON_SECRET>"
 *      with cron invocations when the env var exists. Anything without it
 *      is refused, so visitors can't trigger resets.
 *   3. The seed itself only upserts fixed-email demo/showcase accounts.
 *
 * What it restores: the 70-course ENGAGE catalogue (content, status, and
 * re-drafting of stray published courses), the 100-credit price the demo
 * relies on, Maya's lived-in journey (reset:true wipes drift), and the
 * admin/employer personas. The events world is seeded once at bootstrap
 * and left alone — its seeder is a CLI script, and event drift is benign.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { demoMode } from "@/lib/demo/mode";
import { ensureDemoAdmin, ensurePersona } from "@/lib/demo/personas";
import { spawnShowcase } from "@/lib/showcase/seed";
import { applyCatalogue, type SheetRow } from "../../../../../scripts/import-engage-catalogue";
import fixture from "../../../../../prisma/fixtures/engage-catalogue.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function reset(req: NextRequest) {
  if (!demoMode()) return new NextResponse(null, { status: 404 });

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const catalogue = await applyCatalogue(prisma, fixture as SheetRow[], {
    draftUnlisted: true,
  });
  const priced = await prisma.course.updateMany({
    where: { status: "published", creditCost: 0 },
    data: { creditCost: 100 },
  });

  const admin = await ensureDemoAdmin();
  const maya = await spawnShowcase(admin.id, { reset: true });
  await ensurePersona("employer");

  return NextResponse.json({
    ok: true,
    catalogue,
    priced: priced.count,
    maya: maya.counts,
  });
}

export async function GET(req: NextRequest) {
  return reset(req);
}

export async function POST(req: NextRequest) {
  return reset(req);
}
