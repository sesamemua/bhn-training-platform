import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putR2Object, R2_PUBLIC_URL } from "@/lib/r2";
import { trackServer } from "@/lib/analytics";
import { parseCampaignAttribution } from "@/lib/campaign/attribution";
import { CAMPAIGN_EVENT_NAMES } from "@/lib/campaign/events";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id!;

  const apps = await prisma.creditApplication.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
  });
  return NextResponse.json(apps);
}

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id!;

  // Block stacking: if there's a pending application, refuse.
  const pending = await prisma.creditApplication.findFirst({
    where: { userId, status: "pending" },
  });
  if (pending) {
    return NextResponse.json(
      { error: "You already have a pending application." },
      { status: 409 }
    );
  }

  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "Document storage not configured." }, { status: 500 });
  }

  const form = await req.formData();
  const fullName = String(form.get("fullName") ?? "").trim();
  const organization = String(form.get("organization") ?? "").trim() || null;
  const title = String(form.get("title") ?? "").trim() || null;
  const country = String(form.get("country") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  const useCase = String(form.get("useCase") ?? "").trim();
  const attribution = parseCampaignAttribution(form.get("campaignAttribution"));
  if (!fullName) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (useCase.length < 30) {
    return NextResponse.json(
      { error: "Please describe your use case in at least 30 characters." },
      { status: 400 }
    );
  }

  // Files
  const files: File[] = [];
  for (const value of form.getAll("documents")) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "At least one supporting document is required." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} documents per application.` }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File ${f.name} exceeds 10 MB limit.` }, { status: 400 });
    }
    if (f.type && !ALLOWED_TYPES.has(f.type)) {
      return NextResponse.json(
        { error: `File ${f.name} has unsupported type ${f.type}. Allowed: PDF, image, Word doc.` },
        { status: 400 }
      );
    }
  }

  // Upload all to R2 first; only persist if every upload succeeds.
  const applicationId = (await import("crypto")).randomBytes(8).toString("hex") + Date.now().toString(36);
  const docs: Array<{ key: string; name: string; size: number; contentType: string }> = [];
  for (const f of files) {
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const key = `credit-applications/${applicationId}/${Date.now()}-${safeName}`;
    const buf = Buffer.from(await f.arrayBuffer());
    await putR2Object(key, buf, f.type || undefined);
    docs.push({ key, name: safeName, size: f.size, contentType: f.type || "application/octet-stream" });
  }

  const app = await prisma.creditApplication.create({
    data: {
      userId,
      status: "pending",
      fullName, organization, title, country, phone, useCase,
      documents: docs,
    },
  });

  await trackServer({
    userId,
    role: (session.user as { role?: string }).role ?? "trainee",
    name: CAMPAIGN_EVENT_NAMES.engageApplicationSubmitted,
    path: "/credits/apply",
    props: {
      program: "engage",
      applicationId: app.id,
      attribution,
    },
  });

  return NextResponse.json(app, { status: 201 });
}
