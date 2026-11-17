import { loadLinkedinBoard, saveLinkedinBoard } from "@/lib/events/linkedin-store";
import { searchLinkedinPublicPosts } from "@/lib/events/linkedin-public-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  try {
    let current = await loadLinkedinBoard();
    if (current.board.publicSearchAt?.startsWith(today)) return Response.json({ skipped: "Already checked today." });
    const entries = await searchLinkedinPublicPosts(now);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (current.board.publicSearchAt?.startsWith(today)) return Response.json({ skipped: "Already checked today." });
      const saved = await saveLinkedinBoard(current.version, { action: "public_search", entries }, "Daily public LinkedIn search");
      if (!saved.conflict) return Response.json({ added: saved.snapshot.board.entries.length - current.board.entries.length });
      current = saved.snapshot;
    }
    return Response.json({ error: "The tracker was busy. Nothing was overwritten." }, { status: 409 });
  } catch (error) {
    console.error("Daily LinkedIn public search failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Daily public search failed." }, { status: 503 });
  }
}
