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
import { applyRoster, AUTO_SOURCE_ID, recordFailedImport } from "@/lib/eligibility/apply";
import { looksLikeSignInPage } from "@/lib/eligibility/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ID = AUTO_SOURCE_ID;
const METHOD = "cron";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const url = process.env.ELIGIBILITY_SHEET_CSV;
  if (!url) {
    return NextResponse.json({
      ok: false,
      reason: "ELIGIBILITY_SHEET_CSV is not set, so this list is still pasted in by hand.",
    });
  }

  let text = "";
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`the sheet answered ${res.status}`);
    text = await res.text();
    if (looksLikeSignInPage(text)) {
      throw new Error("that link wants a sign-in — share the sheet, or publish it to the web as CSV");
    }
  } catch (err) {
    const error = (err as Error).message || "the sheet could not be read";
    await recordFailedImport(SOURCE_ID, METHOD, error);
    return NextResponse.json({ ok: false, error });
  }

  const done = await applyRoster({ sourceId: SOURCE_ID, text, method: METHOD });
  if (!done.ok) {
    const error = "no addresses in what came back — the list was left alone";
    await recordFailedImport(SOURCE_ID, METHOD, error);
    return NextResponse.json({ ok: false, error });
  }

  return NextResponse.json({
    ok: true, imported: done.rows, skipped: done.skipped,
    added: done.added.length, removed: done.removed.length,
  });
}
