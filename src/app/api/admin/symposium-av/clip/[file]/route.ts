/**
 * Serves one cropped region of a Livecast AV document.
 *
 *   GET /api/admin/symposium-av/clip/q2026--projectors.png
 *
 * These are pictures of the vendor's own quotes — unit prices, discounts,
 * the lot — so they are NOT in public/. They live in private/av-clips/
 * and come through here, behind the same admin check as the page that
 * shows them. Anything in public/ is served to anyone who guesses the
 * filename, and "q2026--projectors.png" is not hard to guess.
 *
 * The filename is checked against the generated manifest rather than
 * sanitised. A whitelist cannot be talked into path traversal; a
 * sanitiser can, and this one would be reading from the filesystem with
 * whatever the URL says.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/auth";
import { AV_CLIPS, AV_PAGES } from "@/lib/symposium/av";

export const dynamic = "force-dynamic";

/** Every filename the manifest knows about. Nothing else is servable. */
const ALLOWED = new Set([
  ...Object.values(AV_CLIPS).flatMap((byDoc) =>
    Object.values(byDoc).flatMap((c) => [c.file, c.pageFile]),
  ),
  ...Object.values(AV_PAGES).map((p) => p.file),
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return new NextResponse("Not found", { status: 404 });

  const { file } = await params;
  if (!ALLOWED.has(file)) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await readFile(path.join(process.cwd(), "private", "av-clips", file));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        // Immutable: the crops only change when the source PDFs do, and
        // that means a new deploy. Private, because of what they show.
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
