import { NextRequest, NextResponse } from "next/server";
import { requireCourseOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseManifest } from "@/lib/scorm-parser";
import { putR2Object, deleteR2Prefix, R2_PUBLIC_URL } from "@/lib/r2";
import path, { posix } from "path";
import fs from "fs";
import os from "os";
import unzipper from "unzipper";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: courseId } = await params;
  // requireCourseOwner: SCORM upload wipes the previous R2 prefix and
  // rewrites the course's runtime entry point — must be locked to the
  // owning instructor (or admins moderating). Without this, any
  // instructor could replace any course's content.
  try {
    await requireCourseOwner(courseId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!R2_PUBLIC_URL) {
    return NextResponse.json(
      { error: "R2 not configured. Set R2_PUBLIC_URL and R2 credentials." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Extract zip into /tmp (Vercel allows ~512MB ephemeral writes here)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `scorm-${courseId}-`));
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const zipPath = path.join(tmpDir, "package.zip");
    fs.writeFileSync(zipPath, buffer);

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: tmpDir }))
        .on("close", resolve)
        .on("error", reject);
    });
    fs.unlinkSync(zipPath);

    const manifestPath = path.join(tmpDir, "imsmanifest.xml");
    if (!fs.existsSync(manifestPath)) {
      return NextResponse.json({ error: "No imsmanifest.xml found" }, { status: 422 });
    }
    const manifestXml = fs.readFileSync(manifestPath, "utf-8");
    const manifest = await parseManifest(manifestXml);

    // Wipe any prior version of this course's SCORM in R2
    const r2Prefix = `scorm/${courseId}`;
    await deleteR2Prefix(r2Prefix);

    // Walk the extracted tree and upload every file to R2
    const filesToUpload: { abs: string; rel: string }[] = [];
    function walk(dir: string, base = "") {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(abs, rel);
        else if (entry.isFile()) filesToUpload.push({ abs, rel });
      }
    }
    walk(tmpDir);

    // Upload in parallel batches of 8 to keep Vercel function memory reasonable.
    // Security (PT-05, May 2026 pen test): sanitise the extracted path
    // before using it as an R2 key to prevent zip-slip attacks where a
    // crafted SCORM ZIP embeds entries with "../" paths that would resolve
    // outside the scorm/<courseId>/ prefix.
    const concurrency = 8;
    for (let i = 0; i < filesToUpload.length; i += concurrency) {
      const batch = filesToUpload.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async ({ abs, rel }) => {
          // posix.normalize collapses ".." segments; the replace strips
          // any remaining leading "../" traversal sequences.
          const safeRel = posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
          if (!safeRel || safeRel === ".") return; // skip degenerate paths
          const body = fs.readFileSync(abs);
          await putR2Object(`${r2Prefix}/${safeRel}`, body);
        })
      );
    }

    // Serve via same-origin proxy so SCORM content can talk to the LMS API.
    // (Cross-origin R2 URLs break window.parent.API discovery.)
    const uploadPath = `/scorm-files/${courseId}`;

    const pkg = await prisma.scormPackage.upsert({
      where: { courseId },
      update: {
        version: manifest.version,
        entryPoint: manifest.entryPoint,
        manifestData: JSON.stringify(manifest),
        uploadPath,
      },
      create: {
        courseId,
        version: manifest.version,
        entryPoint: manifest.entryPoint,
        manifestData: JSON.stringify(manifest),
        uploadPath,
      },
    });

    await prisma.course.update({
      where: { id: courseId },
      data: { courseType: "scorm", title: pkg.version ? undefined : manifest.title },
    });

    return NextResponse.json(pkg, { status: 201 });
  } finally {
    // Always clean up tmp
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
