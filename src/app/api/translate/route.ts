import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
const CF_TOKEN   = process.env.CF_AI_TOKEN;
const ALLOWED = new Set(["en", "es", "fr", "zh", "hi", "ko", "pa", "ar"]);
const MODEL = "m2m100-1.2b";

function cacheKey(text: string, source: string, target: string): string {
  return createHash("sha256")
    .update(`${MODEL}:${source}:${target}:${text}`)
    .digest("hex");
}

interface Body {
  texts: string[];
  source?: string;
  target: string;
}

/**
 * Translate an array of strings via Cloudflare m2m100. Returns same-length
 * array of translations. Failures are returned as the original text so the
 * UI can fall back gracefully. Logged in AIInteraction.
 */
export async function POST(req: NextRequest) {
  if (!CF_TOKEN || !CF_ACCOUNT) {
    return NextResponse.json({ error: "Translation not configured." }, { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  const texts = Array.isArray(body.texts) ? body.texts : [];
  const source = (body.source ?? "en").toLowerCase();
  const target = (body.target ?? "").toLowerCase();
  if (!ALLOWED.has(target)) {
    return NextResponse.json({ error: "Unsupported target language" }, { status: 400 });
  }
  if (target === source) {
    return NextResponse.json({ translated: texts });
  }
  if (texts.length === 0) {
    return NextResponse.json({ translated: [] });
  }
  if (texts.length > 80) {
    return NextResponse.json({ error: "Batch too large (max 80)" }, { status: 400 });
  }

  const session = await getSession();
  const userId = (session?.user as { id?: string })?.id ?? null;
  const start = Date.now();

  // 1. Look up the persistent cache. Same (model, source, target, text)
  // is only ever translated once across the whole platform.
  const hashes = texts.map((t) => cacheKey(t, source, target));
  const cached = await prisma.translation
    .findMany({ where: { hash: { in: hashes } }, select: { hash: true, translatedText: true } })
    .catch(() => [] as { hash: string; translatedText: string }[]);
  const cacheMap = new Map(cached.map((r) => [r.hash, r.translatedText]));

  // 2. For misses, call Cloudflare. m2m100 takes one text per call.
  const out: string[] = new Array(texts.length).fill("");
  const missIndexes: number[] = [];
  texts.forEach((t, i) => {
    const hit = cacheMap.get(hashes[i]);
    if (hit !== undefined) out[i] = hit;
    else missIndexes.push(i);
  });

  async function translateOne(text: string): Promise<string> {
    if (!text || text.trim().length < 2) return text;
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/${MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text, source_lang: source, target_lang: target }),
      }
    );
    const j = await res.json();
    if (!j.success) return text;
    return (j.result?.translated_text as string | undefined) ?? text;
  }

  const concurrency = 6;
  let cursor = 0;
  async function worker() {
    while (true) {
      const k = cursor++;
      if (k >= missIndexes.length) return;
      const i = missIndexes[k];
      out[i] = await translateOne(texts[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // 3. Persist new translations. skipDuplicates handles the race where
  // two requests translated the same string concurrently.
  if (missIndexes.length > 0) {
    const rows = missIndexes
      .filter((i) => out[i] !== texts[i]) // don't cache pass-throughs
      .map((i) => ({
        hash: hashes[i],
        sourceLang: source,
        targetLang: target,
        sourceText: texts[i],
        translatedText: out[i],
        model: MODEL,
      }));
    if (rows.length > 0) {
      await prisma.translation.createMany({ data: rows, skipDuplicates: true }).catch(() => {});
    }
  }

  // 4. Aggregate log entry per batch — keeps AIInteraction readable.
  await prisma.aIInteraction.create({
    data: {
      userId,
      kind: "translate",
      provider: "cloudflare",
      model: MODEL,
      latencyMs: Date.now() - start,
      success: true,
    },
  }).catch(() => {});

  return NextResponse.json({
    translated: out,
    target,
    cacheHits: texts.length - missIndexes.length,
    cacheMisses: missIndexes.length,
  });
}
