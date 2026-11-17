/**
 * Thin AI adapter. One module, two providers, three operations:
 *   chat()  — generate text from a message list (system+user)
 *   embed() — turn text into 384-d vectors (Cloudflare BGE small)
 *   classify() — score text against a list of labels (zero-shot via chat)
 *
 * Every call is logged in AIInteraction with provider, model, latency,
 * success, optional token counts. Failures never throw — they return a
 * structured error so feature code can degrade gracefully.
 */
import { prisma } from "@/lib/prisma";
import { computeCostUsd } from "./pricing";

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
const CF_TOKEN   = process.env.CF_AI_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

export const AI_CONFIGURED = {
  chat:  !!CF_TOKEN || !!GEMINI_KEY,
  embed: !!CF_TOKEN,                 // BGE only on Cloudflare
  image: !!CF_TOKEN,                 // FLUX.2 [klein] on Cloudflare
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface BaseOpts {
  userId?: string | null;
  feature?: string;       // e.g. "course_search", "course_summary", "course_tutor"
}
export interface ChatOpts extends BaseOpts {
  maxTokens?: number;
  temperature?: number;
  /** Abort the provider call after this many ms (default 20000). */
  timeoutMs?: number;
  /** Prompt-template version recorded in telemetry (src/lib/ai/prompts.ts). */
  promptVersion?: string;
}
interface EmbedOpts extends BaseOpts {
  /** override model — defaults to bge-small-en-v1.5 (384d). */
  model?: "@cf/baai/bge-small-en-v1.5" | "@cf/baai/bge-base-en-v1.5";
}

async function logInteraction(input: {
  userId?: string | null;
  kind: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  promptVersion?: string;
  validationPassed?: boolean;
}): Promise<string | null> {
  try {
    const row = await prisma.aIInteraction.create({
      data: {
        userId: input.userId ?? null,
        kind: input.kind,
        provider: input.provider,
        model: input.model,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        costUsd: computeCostUsd(input.model, input.promptTokens, input.completionTokens),
        promptVersion: input.promptVersion ?? null,
        validationPassed: input.validationPassed ?? null,
        latencyMs: input.latencyMs,
        success: input.success,
        errorMessage: input.errorMessage ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("AI log failed:", (e as Error).message);
    return null;
  }
}

// Cloudflare Workers AI chat model. NOTE: Cloudflare retires model slugs on a
// schedule (the previous @cf/meta/llama-3.1-8b-instruct was deprecated
// 2026-05-30, returning HTTP 410). If chat() starts failing platform-wide,
// check https://developers.cloudflare.com/workers-ai/models/ for the current
// slug and update this one constant. The Gemini fallback in chat() keeps the
// platform working in the meantime.
const CF_CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Cloudflare Llama for chat. */
async function chatCloudflare(messages: ChatMessage[], opts: ChatOpts) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_CHAT_MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        max_tokens: opts.maxTokens ?? 512,
        temperature: opts.temperature ?? 0.5,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    }
  );
  const j = await res.json();
  if (!res.ok || !j.success) throw new Error(j.errors?.[0]?.message ?? `Cloudflare AI HTTP ${res.status}`);
  // Newer CF models (e.g. llama-3.3-70b) auto-parse JSON output and return
  // `response` as an OBJECT rather than a string. Normalize to a string here
  // so every caller — plain-text or extractJson — gets a consistent type.
  // (Casting an object `as string` is what made downstream `.replace()` throw.)
  const resp = j.result?.response;
  const text = typeof resp === "string" ? resp : resp != null ? JSON.stringify(resp) : "";
  return {
    text,
    promptTokens: j.result?.usage?.prompt_tokens as number | undefined,
    completionTokens: j.result?.usage?.completion_tokens as number | undefined,
    model: CF_CHAT_MODEL.replace(/^@cf\/meta\//, ""),
  };
}

/** Gemini Flash fallback. Cheap, fast, multimodal-capable (text-only here). */
async function chatGemini(messages: ChatMessage[], opts: ChatOpts) {
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const conversational = messages.filter((m) => m.role !== "system");
  const lastUser = conversational[conversational.length - 1]?.content ?? "";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        contents: [{ role: "user", parts: [{ text: lastUser }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 512, temperature: opts.temperature ?? 0.5 },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    }
  );
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "Gemini call failed");
  return {
    text: (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "") as string,
    promptTokens: j.usageMetadata?.promptTokenCount as number | undefined,
    completionTokens: j.usageMetadata?.candidatesTokenCount as number | undefined,
    model: "gemini-2.0-flash",
  };
}

export async function chat(messages: ChatMessage[], opts: ChatOpts = {}) {
  // Try Cloudflare first (primary), then Gemini (fallback). The fallback is
  // what keeps the platform working through a Cloudflare model deprecation or
  // outage — previously a CF failure took every AI text feature down because
  // there was no second provider in the path.
  const providers: ("cloudflare" | "gemini")[] = [];
  if (CF_TOKEN) providers.push("cloudflare");
  if (GEMINI_KEY) providers.push("gemini");
  if (providers.length === 0) {
    return { ok: false as const, error: "AI not configured", text: "" };
  }

  let lastErr = "AI not configured";
  for (const provider of providers) {
    const start = Date.now();
    try {
      const result = provider === "cloudflare"
        ? await chatCloudflare(messages, opts)
        : await chatGemini(messages, opts);
      const interactionId = await logInteraction({
        userId: opts.userId,
        kind: opts.feature ?? "chat",
        provider,
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: Date.now() - start,
        success: true,
        promptVersion: opts.promptVersion,
      });
      return {
        ok: true as const,
        text: result.text,
        interactionId,
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
      };
    } catch (e) {
      lastErr = (e as Error).message;
      await logInteraction({
        userId: opts.userId,
        kind: opts.feature ?? "chat",
        provider,
        model: "unknown",
        latencyMs: Date.now() - start,
        success: false,
        errorMessage: lastErr,
        promptVersion: opts.promptVersion,
      });
      // fall through to the next provider, if any
    }
  }
  return { ok: false as const, error: lastErr, text: "" };
}

/**
 * Embed an array of strings into 384-d vectors. Returns null on failure.
 * Always batched for efficiency — Cloudflare allows up to 100 strings per call.
 */
export async function embed(texts: string[], opts: EmbedOpts = {}): Promise<number[][] | null> {
  if (!CF_TOKEN || texts.length === 0) return null;
  const start = Date.now();
  const model = opts.model ?? "@cf/baai/bge-small-en-v1.5";
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${model}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texts }),
      }
    );
    const j = await res.json();
    if (!j.success) throw new Error(j.errors?.[0]?.message ?? "embed failed");
    const vectors = j.result?.data as number[][];
    await logInteraction({
      userId: opts.userId,
      kind: opts.feature ?? "embed",
      provider: "cloudflare",
      model: model.replace("@cf/baai/", ""),
      latencyMs: Date.now() - start,
      success: true,
    });
    return vectors;
  } catch (e) {
    await logInteraction({
      userId: opts.userId,
      kind: opts.feature ?? "embed",
      provider: "cloudflare",
      model: model.replace("@cf/baai/", ""),
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (e as Error).message,
    });
    return null;
  }
}

/**
 * Transcribe spoken audio to text via Cloudflare Workers AI (Whisper).
 * Pass the raw recorded bytes (webm/ogg/wav/mp3 all work). Returns the
 * transcript, or { ok:false } when CF isn't configured or the call fails.
 * No Gemini fallback — Whisper is Cloudflare-only here. The server route is
 * responsible for capping audio size.
 */
export interface TranscriptWord { word: string; start: number; end: number }

export async function transcribe(
  audio: Uint8Array | ArrayBuffer,
  opts: BaseOpts = {},
): Promise<{ ok: true; text: string; words: TranscriptWord[]; wordCount: number } | { ok: false; error: string }> {
  if (!CF_TOKEN || !CF_ACCOUNT) return { ok: false, error: "Speech-to-text isn't configured." };
  const bytes = audio instanceof ArrayBuffer ? new Uint8Array(audio) : audio;
  const start = Date.now();
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/openai/whisper`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/octet-stream" },
        body: bytes as unknown as BodyInit,
      },
    );
    const j = (await res.json()) as {
      success?: boolean;
      result?: { text?: string; word_count?: number; words?: { word?: string; start?: number; end?: number }[] };
      errors?: { message: string }[];
    };
    if (!res.ok || j.success === false) {
      throw new Error(j.errors?.[0]?.message ?? `Whisper HTTP ${res.status}`);
    }
    const text = (j.result?.text ?? "").trim();
    const words: TranscriptWord[] = Array.isArray(j.result?.words)
      ? j.result!.words!
          .filter((w) => typeof w.word === "string" && typeof w.start === "number" && typeof w.end === "number")
          .map((w) => ({ word: w.word as string, start: w.start as number, end: w.end as number }))
      : [];
    await logInteraction({
      userId: opts.userId,
      kind: opts.feature ?? "transcribe",
      provider: "cloudflare",
      model: "@cf/openai/whisper",
      latencyMs: Date.now() - start,
      success: true,
    });
    return { ok: true, text, words, wordCount: j.result?.word_count ?? words.length };
  } catch (e) {
    const err = (e as Error).message;
    await logInteraction({
      userId: opts.userId,
      kind: opts.feature ?? "transcribe",
      provider: "cloudflare",
      model: "@cf/openai/whisper",
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: err,
    });
    return { ok: false, error: err };
  }
}

/** Format a number[] into a Postgres pgvector literal: `[0.1, 0.2, …]`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

interface ImageOpts extends BaseOpts {
  /** Sampling steps. FLUX.2 [klein] is distilled and sharp at 4. */
  steps?: number;
  width?: number;
  height?: number;
}

/**
 * Cloudflare's image model. Stable Diffusion (SDXL Lightning, SD 1.5
 * inpainting) was retired on 20 Nov 2026; FLUX.2 [klein] replaces both.
 */
export const CF_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";

/**
 * One FLUX.2 [klein] call. The API takes a multipart form and answers JSON
 * with the picture as base64 JPEG. Pass `image` to edit or extend a
 * reference picture instead of drawing from scratch. Throws on failure.
 */
export async function runFlux(o: { prompt: string; width: number; height: number; steps?: number; image?: Buffer; timeoutMs?: number }): Promise<Buffer> {
  if (!CF_ACCOUNT || !CF_TOKEN) throw new Error("Cloudflare AI is not configured.");
  const form = new FormData();
  form.append("prompt", o.prompt);
  form.append("width", String(o.width));
  form.append("height", String(o.height));
  form.append("steps", String(o.steps ?? 4));
  if (o.image) form.append("input_image_0", new Blob([new Uint8Array(o.image)], { type: "image/png" }), "input.png");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${CF_IMAGE_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
  });
  const body = (await res.json().catch(() => null)) as { result?: { image?: string }; errors?: { message?: string }[] } | null;
  const b64 = body?.result?.image;
  if (!res.ok || !b64) throw new Error(`Image gen failed: ${res.status} ${body?.errors?.[0]?.message ?? ""}`.trim());
  return Buffer.from(b64, "base64");
}

/**
 * Generate an image from a text prompt. Returns PNG bytes (Uint8Array)
 * suitable for streaming straight into R2, or null on failure.
 */
export async function generateImage(prompt: string, opts: ImageOpts = {}): Promise<Uint8Array | null> {
  if (!CF_TOKEN) return null;
  const start = Date.now();
  try {
    const jpeg = await runFlux({
      prompt: `${prompt} No text, words, letters, watermark or signature.`,
      width: opts.width ?? 1024,
      height: opts.height ?? 1024,
      steps: opts.steps,
    });
    // Callers store .png in R2; keep that contract.
    const { default: sharp } = await import("sharp");
    const buf = new Uint8Array(await sharp(jpeg).png().toBuffer());
    await logInteraction({
      userId: opts.userId,
      kind: opts.feature ?? "image",
      provider: "cloudflare",
      model: "flux-2-klein-9b",
      latencyMs: Date.now() - start,
      success: true,
    });
    return buf;
  } catch (e) {
    await logInteraction({
      userId: opts.userId,
      kind: opts.feature ?? "image",
      provider: "cloudflare",
      model: "flux-2-klein-9b",
      latencyMs: Date.now() - start,
      success: false,
      errorMessage: (e as Error).message,
    });
    return null;
  }
}

/**
 * Build a styled prompt for course/pathway thumbnails. Tries to align with
 * a clean, modern, brand-blue editorial aesthetic — no text, no people,
 * no logos. Subjects are bioprocess/scientific themes.
 */
export function buildThumbnailPrompt(input: {
  title: string;
  description?: string | null;
  category?: string | null;
}): string {
  const subject = [input.category, input.title].filter(Boolean).join(" — ");
  const desc = input.description ? ` (${input.description.slice(0, 200)})` : "";
  return (
    `Editorial illustration for a biomanufacturing training module. ` +
    `Subject: ${subject}${desc}. ` +
    `Style: minimal, abstract, geometric, soft gradients in deep blues with hints of violet and cyan, ` +
    `subtle scientific motifs (waves, curves, particles, molecular shapes), ` +
    `clean composition with negative space, premium magazine-cover feel, ` +
    `flat vector aesthetic, no text, no logo, no people.`
  );
}

// Words that don't carry meaning on their own — strip them when picking
// the single representative word from a course title.
const STOPWORDS = new Set([
  "a","an","the","of","in","for","and","or","to","with","on","at","by","from",
  "is","are","be","this","that","into","onto","via","as","its","it",
  "intro","introduction","basics","basic","advanced","essential","essentials",
  "fundamentals","fundamental","overview","module","modules","series","training",
  "course","courses","program","programme","section","part","level",
  "i","ii","iii","iv","v","vi",
]);

/**
 * Pick a single word from a course's title (or category, if set) that
 * mostly represents what the course is about. Used as a thumbnail-prompt
 * subject so SDXL can paint a focused, abstract take on it.
 */
export function chooseOneWord(input: { title: string; category?: string | null }): string {
  // Prefer category — typically already a single domain word ("Cleanroom").
  if (input.category) {
    const cat = input.category.split(/\s+/).find((w) => !STOPWORDS.has(w.toLowerCase()));
    if (cat) return cat.replace(/[^A-Za-z\-]/g, "").toLowerCase() || "biomanufacturing";
  }
  // Otherwise, first significant word of the title.
  const tokens = input.title.split(/\s+/).map((w) => w.replace(/[^A-Za-z\-]/g, ""));
  const pick = tokens.find((w) => w && !STOPWORDS.has(w.toLowerCase()));
  return (pick ?? "biomanufacturing").toLowerCase();
}

/**
 * Build a thumbnail prompt anchored on a single representative word.
 * Same editorial brand language as buildThumbnailPrompt, but the SDXL
 * model gets a tighter focal subject so output is more iconic.
 */
export function buildOneWordThumbnailPrompt(word: string): string {
  return (
    `Editorial illustration representing the concept of "${word}" for a biomanufacturing training catalog. ` +
    `Style: minimal, abstract, geometric, soft gradients in deep blues with hints of violet and cyan, ` +
    `subtle scientific motifs (waves, curves, particles, molecular shapes) suggestive of the subject, ` +
    `clean composition with negative space, premium magazine-cover feel, ` +
    `flat vector aesthetic, no text, no logo, no people.`
  );
}

/**
 * Use the LLM to extract 3–5 concrete visual objects an editorial
 * illustrator would draw to represent a course's topic. Returns a
 * curated array (deduped, lowercase, profanity-stripped — though
 * Cloudflare Llama is well-behaved here).
 *
 * Falls back to a sensible single-item list keyed off chooseOneWord()
 * if the LLM call fails or returns junk — the SDXL prompt builder
 * then still has *something* concrete to draw rather than the very
 * abstract "concept of foo" framing.
 */
export async function extractThumbnailMotifs(input: {
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string | null;
}, opts: BaseOpts = {}): Promise<string[]> {
  const fallback = [chooseOneWord(input)];
  if (!AI_CONFIGURED.chat) return fallback;

  const desc = input.description ? `\nDescription: ${input.description.slice(0, 400)}` : "";
  const cat  = input.category    ? `\nCategory: ${input.category}`                       : "";
  const tags = input.tags        ? `\nTags: ${input.tags.slice(0, 200)}`                 : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You're helping pick visual elements for an editorial thumbnail. " +
        "Reply with 3–5 concrete visual objects an illustrator would draw to evoke a life-sciences / biomanufacturing training course. " +
        "Comma-separated; no numbering, no quotes, no commentary, no people, no text. " +
        "Prefer iconic scientific objects (bioreactor, pipette, cleanroom curtain, DNA helix, GMP binder, audit clipboard, gel bands, regulatory diagram, chromatography column, fill-finish needle, microscope, etc.) over abstract shapes. " +
        "If the topic is administrative or regulatory rather than wet-lab, pick objects that reflect that (binders, scales of justice, signature pen, audit trail diagram).",
    },
    {
      role: "user",
      content: `Course title: ${input.title}${cat}${tags}${desc}\n\nVisual elements:`,
    },
  ];

  const r = await chat(messages, {
    ...opts,
    feature: opts.feature ?? "thumbnail_motif",
    maxTokens: 80,
    temperature: 0.4,
  });
  if (!r.ok || !r.text) return fallback;

  // Parse: split on commas / newlines, trim, drop punctuation, dedupe,
  // strip anything that obviously isn't a noun phrase. Cap at 5.
  const tokens = r.text
    .split(/[,\n;]/)
    .map((s) => s.trim().replace(/^[\s\-•*\d.]+/, "").replace(/[".]+$/, "").toLowerCase())
    .filter((s) => s.length > 1 && s.length < 60)
    .filter((s) => !/[A-Z_<>]/.test(s)); // catch model-tag echoes
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    cleaned.push(t);
    if (cleaned.length >= 5) break;
  }
  return cleaned.length >= 2 ? cleaned : fallback;
}

/**
 * Build a topic-anchored thumbnail prompt that gives SDXL specific
 * visual hooks — the title + category provide *what* the course is
 * about, the motifs provide concrete objects to draw, and the style
 * block keeps the catalog visually consistent.
 *
 * This is the recommended builder for new course thumbnails. The
 * older buildThumbnailPrompt / buildOneWordThumbnailPrompt are kept
 * for backward compatibility with the seed scripts that already use
 * them.
 */
export function buildTopicThumbnailPrompt(input: {
  title: string;
  category?: string | null;
  motifs: string[];
}): string {
  const subject = [input.category, input.title].filter(Boolean).join(" — ");
  const motifLine = input.motifs.length > 0
    ? `Visual elements (draw these, not abstract shapes): ${input.motifs.join(", ")}.`
    : "";
  return (
    `Editorial cover illustration for a biomanufacturing training course. ` +
    `Subject: ${subject}. ` +
    `${motifLine} ` +
    `Style: clean modern flat-vector composition; deep navy and brand-blue palette with violet/cyan accents; ` +
    `confident magazine-cover composition with strong negative space; soft gradients; subtle film grain. ` +
    `Hard requirements: NO text, NO words, NO letters, NO numbers, NO logos, NO people, NO faces, ` +
    `no photoreal humans, no signatures, no watermarks. Imagery must literally evoke the subject.`
  );
}
