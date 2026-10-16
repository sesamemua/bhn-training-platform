import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { printJobPdf } from "@/lib/events/print-store";

export const dynamic = "force-dynamic";
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await printJobPdf(id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const filename = result.job.label.replace(/[^a-z0-9-]+/gi, "-").slice(0, 100) || "symposium-print";
  return new NextResponse(new Uint8Array(result.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
