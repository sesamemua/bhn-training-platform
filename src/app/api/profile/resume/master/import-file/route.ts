/**
 * Master resume — drag-and-drop a resume FILE straight into the library.
 *
 *   POST /api/profile/resume/master/import-file   (multipart/form-data)
 *     field: file  — a PDF / DOCX / TXT resume
 *
 * In-memory pipeline, no storage round-trip: extract text → AI-parse to
 * the structured tree → hand to the shared master importer (embed,
 * cosine-dedupe, insert with anchor provenance + one-shot header copy).
 *
 *   Response: { ok, created, skipped, total, headerCopied, note? }
 *
 * Unlike ai-extract (which reads an existing Resume row) this never
 * touches the user's tailored-resume list — it seeds the master only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { extractResumeText, isSupportedResumeFile } from "@/lib/resume/extract";
import { parseResumeText } from "@/lib/resume/parse";
import { importContentIntoMaster, EmbeddingUnavailableError } from "@/lib/resume/master-import";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

async function getMyUserId(): Promise<string | null> {
  const session = await requireSession().catch(() => null);
  if (!session) return null;
  return (session.user as { id?: string }).id ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await getMyUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Resume file too large (max 10 MB)." }, { status: 413 });
  }
  if (!isSupportedResumeFile(file.name, file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Upload a PDF, DOCX, or TXT." }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Extract plain text (PDF / DOCX / TXT).
  let text: string;
  try {
    text = await extractResumeText(buf, { filename: file.name, mime: file.type });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read the file: ${(e as Error).message}` }, { status: 422 });
  }
  if (text.trim().length < 80) {
    return NextResponse.json(
      { error: "Couldn't extract usable text — the file may be a scan/image. Try a text-based PDF or DOCX." },
      { status: 422 },
    );
  }

  // AI-parse the text into the structured resume tree.
  const parsed = await parseResumeText(text, { userId });

  // Import its bullets into the master library.
  try {
    const result = await importContentIntoMaster(userId, parsed, { sourceResumeId: null });
    return NextResponse.json({ ok: true, fileName: file.name, ...result });
  } catch (e) {
    if (e instanceof EmbeddingUnavailableError) {
      return NextResponse.json({ error: "Embedding service unavailable — try again in a moment." }, { status: 503 });
    }
    throw e;
  }
}
