import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { R2_PUBLIC_URL_PREFIXES } from "@/lib/r2";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";
import { findCompanyLogo, logoOverride } from "@/lib/social/company-logo";
import { SYMPOSIUM_SOCIAL_STREAM } from "@/lib/social/speakers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function permittedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const trustedHosts = R2_PUBLIC_URL_PREFIXES.map((prefix) => new URL(prefix).host);
    return parsed.protocol === "https:" && !isIP(parsed.hostname) && (
      trustedHosts.includes(parsed.host) ||
      parsed.hostname.endsWith(".r2.dev") ||
      parsed.hostname.endsWith(".blob.vercel-storage.com") ||
      parsed.hostname === "logo.clearbit.com"
    );
  } catch {
    return false;
  }
}

async function loadImage(url: string | null, maxBytes: number): Promise<string | null> {
  if (!url || !permittedImageUrl(url)) return null;
  const response = await fetch(url, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const mime = response?.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response?.ok || !["image/jpeg", "image/png", "image/webp"].includes(mime) ||
      Number(response.headers.get("content-length") ?? 0) > maxBytes) return null;
  const bytes = await response.arrayBuffer();
  return bytes.byteLength <= maxBytes
    ? `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
    : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const post = await prisma.socialPost.findUnique({
    where: { id },
    select: { stream: true, kind: true, deadlineId: true, assetSpec: true },
  });
  if (post?.stream !== SYMPOSIUM_SOCIAL_STREAM || post.kind !== "speaker") {
    return NextResponse.json({ error: "Graphic not found" }, { status: 404 });
  }
  const speaker = await prisma.speaker.findUnique({
    where: { id: post.deadlineId },
    select: {
      fullName: true, title: true, organization: true, photoUrl: true,
      event: { select: { id: true, slug: true } },
    },
  });
  if (speaker?.event.slug !== EVENT_SLUG || !speaker.photoUrl) {
    return NextResponse.json({ error: "Headshot unavailable" }, { status: 404 });
  }

  const companyLogoUrl = logoOverride(post.assetSpec) ??
    await findCompanyLogo(prisma, speaker.event.id, speaker.organization);
  const [photo, companyLogo] = await Promise.all([
    loadImage(speaker.photoUrl, 8_000_000),
    loadImage(companyLogoUrl, 3_000_000),
  ]);
  if (!photo) {
    return NextResponse.json({ error: "Headshot could not be loaded" }, { status: 502 });
  }
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/biohubnet-logo.png"))).toString("base64")}`;
  return renderSpeakerGraphic({
    logo,
    photo,
    companyLogo,
    fullName: speaker.fullName,
    title: speaker.title,
    organization: speaker.organization,
    id,
    download: req.nextUrl.searchParams.has("download"),
  });
}

export function renderSpeakerGraphic({
  logo, photo, companyLogo, fullName, title, organization, id, download,
}: {
  logo: string;
  photo: string;
  companyLogo?: string | null;
  fullName: string;
  title: string | null;
  organization: string | null;
  id: string;
  download: boolean;
}) {
  const name = fullName.trim();
  const role = [title?.trim(), organization?.trim()].filter(Boolean).join(" | ");
  const nameSize = name.length > 30 ? 76 : name.length > 22 ? 88 : 104;

  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", width: 1600, height: 1600, background: "#ffffff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", height: 240, alignItems: "center", justifyContent: "space-between", padding: "35px 75px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="BioHubNet" width={590} height={155} style={{ objectFit: "contain" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", color: "#155c69", fontSize: 46, fontWeight: 800 }}>
          <span>2026 ANNUAL</span><span>SYMPOSIUM</span>
        </div>
      </div>
      <div style={{ display: "flex", height: 1120, background: "#eaf4f3" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 930, padding: "95px 75px 70px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#007c90", fontSize: 42, fontWeight: 800 }}>MEET THE SPEAKER</span>
            <span style={{ color: "#183642", fontSize: nameSize, fontWeight: 800, lineHeight: 1.08, marginTop: 45, overflowWrap: "anywhere" }}>{name}</span>
            {role && <span style={{ color: "#284e58", fontSize: 43, fontWeight: 600, lineHeight: 1.28, marginTop: 42, overflowWrap: "anywhere" }}>{role}</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            {companyLogo && (
              <div style={{ display: "flex", width: 390, height: 155, alignItems: "center", justifyContent: "center", background: "#ffffff", padding: 20, marginBottom: 35 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={companyLogo} alt={organization ?? "Organization"} width={350} height={115} style={{ objectFit: "contain" }} />
              </div>
            )}
            <span style={{ color: "#155c69", fontSize: 40, fontWeight: 700 }}>OCTOBER 29, 2026  ·  TORONTO</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt={name} width={670} height={1120} style={{ objectFit: "cover", objectPosition: "center" }} />
      </div>
      <div style={{ display: "flex", height: 240, alignItems: "center", justifyContent: "center", background: "#006b7c", color: "#ffffff", fontSize: 70, fontWeight: 800 }}>
        Register for the symposium
      </div>
    </div>,
    {
      width: 1600,
      height: 1600,
      headers: {
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="biohubnet-symposium-${id}.png"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
