/**
 * Vercel Cron — re-read the ENGAGE / EXPERIENCE list overnight.
 *
 *   GET /api/cron/eligibility-import
 *
 * The lists are hand-pasted exports, which means they are only as fresh
 * as the last person who remembered. That is the whole reason the form
 * stopped turning people away: somebody accepted this morning is on none
 * of them. This reads the sheet on its own instead.
 *
 * The same read also happens on demand: when a registrant's address is
 * on none of the lists, the check re-reads the sheet before believing
 * it (refreshOnMiss). This job is the floor under that — the list stays
 * current even in a week when nobody registers.
 *
 * It needs one thing: `ELIGIBILITY_SHEET_CSV`, a URL this server can
 * fetch without signing in — the sheet's own CSV export with link
 * sharing on, or a File → Share → Publish to web CSV link. Unset, the
 * job does nothing and says so, which beats a schedule that looks alive
 * while importing a sign-in page.
 *
 * The two EQUIP workbooks live on SharePoint and cannot be read without
 * Microsoft credentials, so they stay manual — and EQUIP applications
 * made on this platform already count live, with no import at all.
 */
import { NextResponse } from "next/server";
import { importFromSheet } from "@/lib/eligibility/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!process.env.ELIGIBILITY_SHEET_CSV) {
    return NextResponse.json({
      ok: false,
      reason: "ELIGIBILITY_SHEET_CSV is not set, so this list is still pasted in by hand.",
    });
  }

  const done = await importFromSheet({ method: "cron" });
  return NextResponse.json(
    done.ok
      ? { ok: true, imported: done.rows, added: done.added, removed: done.removed }
      : { ok: false, error: done.error },
  );
}
