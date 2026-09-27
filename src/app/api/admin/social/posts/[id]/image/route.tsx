import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { R2_PUBLIC_URL_PREFIXES } from "@/lib/r2";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";
import { SYMPOSIUM_SOCIAL_STREAM } from "@/lib/social/speakers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function permittedHeadshot(url: string): boolean {
  try {
    const parsed = new URL(url);
    const trustedHosts = R2_PUBLIC_URL_PREFIXES.map((prefix) => new URL(prefix).host);
    return parsed.protocol === "https:" && (
      trustedHosts.includes(parsed.host) || parsed.hostname.endsWith(".r2.dev")
    );
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const post = await prisma.socialPost.findUnique({
    where: { id },
    select: { stream: true, kind: true, deadlineId: true },
  });
  if (post?.stream !== SYMPOSIUM_SOCIAL_STREAM || post.kind !== "speaker") {
    return NextResponse.json({ error: "Graphic not found" }, { status: 404 });
  }
  const speaker = await prisma.speaker.findUnique({
    where: { id: post.deadlineId },
    select: {
      fullName: true, title: true, organization: true, photoUrl: true,
      event: { select: { slug: true } },
    },
  });
  if (speaker?.event.slug !== EVENT_SLUG || !speaker.photoUrl || !permittedHeadshot(speaker.photoUrl)) {
    return NextResponse.json({ error: "Headshot unavailable" }, { status: 404 });
  }

  const photoResponse = await fetch(speaker.photoUrl, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const mime = photoResponse?.headers.get("content-type")?.split(";")[0] ?? "";
  if (!photoResponse?.ok || !["image/jpeg", "image/png", "image/webp"].includes(mime) ||
      Number(photoResponse.headers.get("content-length") ?? 0) > 8_000_000) {
    return NextResponse.json({ error: "Headshot could not be loaded" }, { status: 502 });
  }

  const photoBytes = await photoResponse.arrayBuffer();
  if (photoBytes.byteLength > 8_000_000) {
    return NextResponse.json({ error: "Headshot is too large" }, { status: 502 });
  }
  const photo = `data:${mime};base64,${Buffer.from(photoBytes).toString("base64")}`;
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/biohubnet-logo.png"))).toString("base64")}`;
  return renderSpeakerGraphic({
    logo,
    photo,
    fullName: speaker.fullName,
    title: speaker.title,
    organization: speaker.organization,
    id,
    download: req.nextUrl.searchParams.has("download"),
  });
}

export function renderSpeakerGraphic({
  logo, photo, fullName, title, organization, id, download,
}: {
  logo: string;
  photo: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  id: string;
  download: boolean;
}) {
  const name = fullName.trim();
  const role = [title?.trim(), organization?.trim()].filter(Boolean).join(" | ");
  const nameSize = name.length > 30 ? 58 : name.length > 22 ? 67 : 78;

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: 1200, height: 1200, background: "#ffffff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", height: 180, alignItems: "center", justifyContent: "space-between", padding: "28px 58px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="BioHubNet" width={450} height={118} style={{ objectFit: "contain" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color: "#155c69", fontSize: 29, fontWeight: 700 }}>
          <span>2026 ANNUAL</span><span>SYMPOSIUM</span>
        </div>
      </div>
      <div style={{ display: "flex", height: 840, background: "#eaf4f3" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 720, padding: "72px 58px 56px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#007c90", fontSize: 32, fontWeight: 800 }}>MEET THE SPEAKER</span>
            <span style={{ color: "#183642", fontSize: nameSize, fontWeight: 800, lineHeight: 1.08, marginTop: 34, overflowWrap: "anywhere" }}>{name}</span>
            {role && <span style={{ color: "#284e58", fontSize: 33, fontWeight: 600, lineHeight: 1.28, marginTop: 35, overflowWrap: "anywhere" }}>{role}</span>}
          </div>
          <span style={{ color: "#155c69", fontSize: 30, fontWeight: 700 }}>OCTOBER 29, 2026  ·  TORONTO</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={name} width={480} height={840} style={{ objectFit: "cover", objectPosition: "center" }} />
      </div>
      <div style={{ display: "flex", height: 180, alignItems: "center", justifyContent: "center", background: "#006b7c", color: "#ffffff", fontSize: 52, fontWeight: 800 }}>
        Register for the symposium
      </div>
    </div>,
    {
      width: 1200,
      height: 1200,
      headers: {
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="biohubnet-symposium-${id}.png"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
