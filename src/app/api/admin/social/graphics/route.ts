import { Readable } from "node:stream";
import archiver from "archiver";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { R2_PUBLIC_URL_PREFIXES } from "@/lib/r2";
import { imageSize } from "@/lib/images/size";
import { GET as speakerImage } from "../posts/[id]/image/route";

export const runtime = "nodejs";

const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ids = [...new Set((req.nextUrl.searchParams.get("ids") ?? "").split(","))];
  const zip = req.nextUrl.searchParams.get("zip") === "1";
  if (!ids.length || ids.length > 200 || ids.some((id) => !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || (!zip && ids.length !== 1)) {
    return NextResponse.json({ error: "Choose up to 200 graphics to download." }, { status: 400 });
  }
  const posts = await prisma.socialPost.findMany({
    where: { id: { in: ids } },
    select: { id: true, stream: true, kind: true, assetUrl: true, assetSpec: true },
  });
  if (posts.length !== ids.length) return NextResponse.json({ error: "A post no longer exists. Refresh and try again." }, { status: 404 });

  try {
    const files: { name: string; type: string; bytes: Buffer }[] = [];
    let total = 0;
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(60_000)]);
    for (const [index, id] of ids.entries()) {
      const post = posts.find((item) => item.id === id)!;
      let response: Response;
      if (post.stream === "symposium_2026" && post.kind === "speaker") {
        response = await speakerImage(req, { params: Promise.resolve({ id }) });
      } else {
        const url = new URL(post.assetUrl ?? "");
        const trusted = R2_PUBLIC_URL_PREFIXES.some((prefix) => {
          const base = new URL(prefix);
          return url.protocol === "https:" && url.origin === base.origin && url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`);
        });
        if (!trusted) throw new Error("This graphic is not available from the platform's image store.");
        response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
      }
      if (!response.ok || !response.body) throw new Error("A graphic could not be loaded. Refresh and try again.");
      if (Number(response.headers.get("content-length")) > MAX_IMAGE) {
        await response.body.cancel();
        throw new Error("A graphic exceeds the 15 MB download limit.");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          total += value.byteLength;
          if (size > MAX_IMAGE || total > MAX_TOTAL) throw new Error("The graphics are too large to download together. Download them individually.");
          chunks.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = Buffer.concat(chunks);
      const image = imageSize(bytes);
      if (!image) throw new Error("A graphic is not a supported image.");
      const title = (post.assetSpec as { title?: unknown } | null)?.title;
      const name = (typeof title === "string" ? title : id).normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || id;
      files.push({ name: `${zip ? `${String(index + 1).padStart(2, "0")}-` : ""}${name}.${image.type.split("/")[1]}`, type: image.type, bytes });
    }
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (!zip) return new Response(new Uint8Array(files[0].bytes), {
      headers: { ...headers, "Content-Type": files[0].type, "Content-Disposition": `attachment; filename="${files[0].name}"` },
    });
    const archive = archiver("zip", { store: true });
    archive.on("error", (error) => archive.destroy(error));
    for (const file of files) archive.append(file.bytes, { name: file.name });
    void archive.finalize().catch((error: Error) => archive.destroy(error));
    return new Response(Readable.toWeb(archive) as ReadableStream<Uint8Array>, {
      headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="biohubnet-social-graphics.zip"' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't download the graphics." }, { status: 502 });
  }
}
