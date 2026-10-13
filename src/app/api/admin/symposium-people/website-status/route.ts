import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { WebsitePeopleSchema } from "@/lib/events/speaker-session-actions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    // Read the website's actual projection, not the platform's intended publication.
    const response = await fetch("https://biohubnet.ca/wp-json/biohubnet/v1/approved-people", {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Website unavailable");
    const text = await response.text();
    if (text.length > 2500000) throw new Error("Website response too large");
    const { snapshot } = WebsitePeopleSchema.parse(JSON.parse(text));
    return NextResponse.json(snapshot, { headers });
  } catch {
    return NextResponse.json({ error: "Website check unavailable. No people have been marked missing. Try again." }, { status: 503, headers });
  }
}
