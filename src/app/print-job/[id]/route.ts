import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new NextResponse("Not found", { status: 404 });
  const path = `/admin/workspace/symposium-2026/print?job=${id.data}`;
  // Enter outside the dashboard layout, which otherwise discards signed-out deep links.
  const destination = await getSession() ? path : `/login?callbackUrl=${encodeURIComponent(path)}`;
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
