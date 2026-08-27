/**
 * POST /api/public/equip/start   { name, email }
 *
 * Opens a VentureConnect application for somebody with no platform
 * account. Returns the one link that is their application.
 *
 * VentureConnect only, on purpose. The stream question exists to route
 * between two grants with different rules and different reach; a link
 * that already says which grant it is has answered it, and asking
 * anyway is asking for something we intend to ignore.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * A public write into the funding pipeline needs a ceiling.
 *
 * Per address, because one person opening a second draft is ordinary
 * and one address opening twenty is not; and overall, because varying
 * the address defeats a per-address rule entirely. Both are counted in
 * the database, which is what survives a serverless function being
 * recycled between two requests.
 */
const PER_EMAIL_PER_DAY = 5;
const PER_HOUR_TOTAL = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; email?: unknown };
  const name = String(body.name ?? "").trim().slice(0, 160);
  const email = String(body.email ?? "").trim().slice(0, 200);

  if (name.length < 2) {
    return NextResponse.json({ error: "Please give your full name." }, { status: 400 });
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const hourAgo = new Date(Date.now() - 3600_000);
  const [mine, recent] = await Promise.all([
    prisma.equipApplication.count({
      where: { applicantEmail: { equals: email, mode: "insensitive" }, createdAt: { gte: dayAgo } },
    }),
    prisma.equipApplication.count({ where: { userId: null, createdAt: { gte: hourAgo } } }),
  ]);
  if (mine >= PER_EMAIL_PER_DAY) {
    return NextResponse.json(
      { error: "That address has opened several applications today. Use the link from the first one, or write to equip@biohubnet.ca." },
      { status: 429 },
    );
  }
  if (recent >= PER_HOUR_TOTAL) {
    // Said without the number: it is not a target.
    return NextResponse.json(
      { error: "The form is busier than usual right now. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const token = randomBytes(24).toString("base64url");
  await prisma.equipApplication.create({
    data: {
      userId: null,
      applicantName: name,
      applicantEmail: email,
      publicToken: token,
      stream: "venture_connect",
      status: "draft",
      applicationStage: "full_app",
      // Pre-fill what we already know, so the first two fields of the
      // form are not asked twice.
      formData: { fullName: name, institutionEmail: email },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, token });
}
