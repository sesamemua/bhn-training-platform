import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { PrintActionSchema } from "@/lib/events/print-jobs";
import { changePrintStore, loadPrintStore, uploadPrintTemplate } from "@/lib/events/print-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const safeError = (e: unknown) => e instanceof Error && !/prisma|database|SQL|\n|password|cookie/i.test(e.message) ? e.message.slice(0, 350) : "Couldn't save this print job. Please retry.";

export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try { return NextResponse.json((await loadPrintStore()).snapshot, { headers }); }
  catch (e) { console.error("[symposium-print] load failed", e instanceof Error ? e.name : "unknown"); return NextResponse.json({ error: "Couldn't load Print Jobs. Please retry." }, { status: 500, headers }); }
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  if (Number(req.headers.get("content-length") ?? 0) > 2_800_000) return NextResponse.json({ error: "Use a file smaller than 2 MB." }, { status: 413, headers });
  try {
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const kind = z.enum(["tents", "agenda"]).parse(form.get("kind"));
      const rawVersion = form.get("version");
      const version = z.string().datetime().nullable().parse(rawVersion === "null" ? null : rawVersion);
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 2_000_000 || file.size < 10) return NextResponse.json({ error: "Upload a PDF of up to 2 MB." }, { status: 400, headers });
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!new TextDecoder().decode(bytes.slice(0, 8)).startsWith("%PDF-")) return NextResponse.json({ error: "Choose a PDF document." }, { status: 400, headers });
      const result = await uploadPrintTemplate(version, kind, file.name, bytes);
      return NextResponse.json(result, { status: result.conflict ? 409 : 200, headers });
    }
    const text = await req.text();
    if (text.length > 1_200_000) return NextResponse.json({ error: "Use a smaller import." }, { status: 413, headers });
    const body = z.object({ version: z.string().datetime().nullable(), change: PrintActionSchema }).parse(JSON.parse(text));
    const actor = (session.user as { name?: string | null; email?: string | null }).name || session.user?.email || "Admin";
    const result = await changePrintStore(body.version, body.change, actor);
    return NextResponse.json(result, { status: result.conflict ? 409 : 200, headers });
  } catch (e) {
    console.error("[symposium-print] save failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: e instanceof z.ZodError ? "Check the required fields and file size." : safeError(e) }, { status: 400, headers });
  }
}
