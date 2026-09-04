import { NextResponse } from "next/server";
import { loaderSource } from "@/lib/page-review/loader-source";

const HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(req: Request) {
  const appOrigin = new URL(req.url).origin;
  return new NextResponse(loaderSource(appOrigin), { headers: HEADERS });
}
