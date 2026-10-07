import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { loadPublication } from "@/lib/events/people-publication-store";
import { publicPeopleFeed } from "@/lib/events/people-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "If-None-Match",
  "Access-Control-Expose-Headers": "ETag",
};
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }
export async function GET(req: Request) {
  try {
    const body = JSON.stringify(publicPeopleFeed((await loadPublication()).state));
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    const headers = { ...CORS, ETag: etag, "Cache-Control": "public, max-age=30, s-maxage=30, must-revalidate", "Content-Type": "application/json; charset=utf-8" };
    const tags = req.headers.get("if-none-match")?.split(",").map((s) => s.trim().replace(/^W\//, ""));
    if (tags?.includes(etag) || tags?.includes("*")) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(body, { headers });
  } catch (error) {
    console.error("[people-publication] public read failed", error);
    return NextResponse.json({ error: "Approved profiles are temporarily unavailable." }, { status: 503, headers: { ...CORS, "Cache-Control": "no-store" } });
  }
}
