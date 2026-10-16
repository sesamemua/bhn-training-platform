import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { deviceClass } from "@/lib/analytics";
import { shortcutProps } from "@/lib/page-usage";

/**
 * Public ingest endpoint. Anonymous users can post too — we tag with
 * sessionId so we can still build funnels. Returns 204 fast.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const session = await getSession();
    const userId = (session?.user as { id?: string })?.id ?? null;
    const role = (session?.user as { role?: string })?.role ?? null;

    const ua = req.headers.get("user-agent");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

    // Accept either a single event or an array (sendBeacon batching)
    const events: Array<Record<string, unknown>> = Array.isArray(body)
      ? body
      : [body];

    const valid = events
      .filter((e) => typeof e.name === "string")
      // shortcut_* = personal dashboard shortcuts, sent without analytics
      // consent: keep them only for signed-in users and store nothing else.
      .filter((e) => userId || !String(e.name).startsWith("shortcut_"))
      .slice(0, 50)
      .map((e) => String(e.name).startsWith("shortcut_") ? {
        userId,
        name: String(e.name).slice(0, 64),
        props: shortcutProps(e.props),
      } : ({
        userId,
        role,
        sessionId: typeof e.sessionId === "string" ? e.sessionId : null,
        name: String(e.name).slice(0, 64),
        path: typeof e.path === "string" ? e.path.slice(0, 512) : null,
        referrer: typeof e.referrer === "string" ? e.referrer.slice(0, 512) : null,
        props: (e.props && typeof e.props === "object") ? (e.props as object) : undefined,
        device: deviceClass(ua),
        ip,
        userAgent: ua?.slice(0, 512),
      }));

    if (valid.length > 0) {
      await prisma.event.createMany({ data: valid });
    }
  } catch (e) {
    console.error("track ingest:", (e as Error).message);
  }
  return new NextResponse(null, { status: 204 });
}

