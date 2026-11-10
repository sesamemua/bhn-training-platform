/** Replace an asset's file. The previous file is kept as a version. */
import { NextRequest, NextResponse } from "next/server";
import { MAX_ASSET_BYTES } from "@/lib/assets/core";
import { assetActor, replaceAssetFile } from "@/lib/assets/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await assetActor(req, true);
  if ("error" in gate) return gate.error;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !file.size || file.size > MAX_ASSET_BYTES) return NextResponse.json({ error: "Choose a picture under 4 MB." }, { status: 400 });
  try {
    await replaceAssetFile((await params).id, Buffer.from(await file.arrayBuffer()), file.type, gate.actor.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
