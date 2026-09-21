/**
 * Trainee resume parser. Accepts a multipart upload (PDF / DOCX),
 * extracts text, runs the skill extractor, and returns a preview the
 * trainee can confirm before we persist UserSkill rows. Confirmation
 * is a separate POST so the trainee always sees what they're adding.
 *
 *   POST /api/profile/resume       (multipart "file") — preview
 *   POST /api/profile/resume       (json {confirm:[skillIds]}) — persist
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractSkillsFromText, tagUser } from "@/lib/skills/ontology";

export const runtime = "nodejs";

async function getUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const u = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return u?.id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Branch on content-type: JSON for confirm, multipart for parse.
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { confirm?: string[] };
    const skillIds = (body.confirm ?? []).filter((x): x is string => typeof x === "string");
    if (skillIds.length === 0) return NextResponse.json({ error: "no skill ids supplied" }, { status: 400 });
    let added = 0;
    for (const sid of skillIds) {
      try {
        await prisma.userSkill.upsert({
          where: { userId_skillId: { userId, skillId: sid } },
          create: { userId, skillId: sid, level: 0.6, source: "resume" },
          update: { source: "resume" },
        });
        added++;
      } catch {/* ignore */}
    }
    return NextResponse.json({ ok: true, added });
  }

  // Otherwise: multipart upload to parse.
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let text = "";
  try {
    if (name.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const r = await extractText(new Uint8Array(buf), { mergePages: true });
      text = Array.isArray(r.text) ? r.text.join("\n") : (r.text ?? "");
    } else if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: buf });
      text = r.value ?? "";
    } else if (name.endsWith(".txt")) {
      text = buf.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file type — PDF, DOCX, or TXT only." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read file: ${(e as Error).message}` }, { status: 400 });
  }

  if (text.length < 80) {
    return NextResponse.json({ error: "Resume seems empty — couldn't extract usable text." }, { status: 400 });
  }

  const extraction = await extractSkillsFromText(text);
  // Don't auto-write — return a preview so the trainee approves first.
  return NextResponse.json({
    ok: true,
    extracted: extraction.existing.map((e) => ({ skillId: e.skillId, name: e.name, confidence: e.confidence })),
    novel: extraction.novel.map((n) => ({ name: n.name, confidence: n.confidence })),
    textPreview: text.slice(0, 240) + (text.length > 240 ? "…" : ""),
  });
}
