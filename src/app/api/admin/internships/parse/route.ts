import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { AI_CONFIGURED } from "@/lib/ai";

export const runtime = "nodejs";

const CF_ACCOUNT = process.env.CF_ACCOUNT_ID;
const CF_TOKEN = process.env.CF_AI_TOKEN;

// Bigger model for the structured-output task — Llama 3.1 8B (the
// default chat model) routinely adds preamble or breaks JSON; the 70B
// Fast variant is dramatically more reliable for "return ONLY JSON"
// prompts and still on Cloudflare's free tier.
const STRUCTURED_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const MAX_FILE = 20 * 1024 * 1024; // 20 MB
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ACCEPTED_FILE_TYPES = new Set([
  "application/pdf",
  DOCX_MIME,
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/html",
]);

interface Parsed {
  companyName: string;
  website: string;
  title: string;
  duration: string;
  hours: string;
  location: string;
  type: string;
  compensation: string;
  deadline: string;          // YYYY-MM-DD or empty
  keySkills: string[];       // up to 5
  positionDetails: string;
}

const SYSTEM = `You extract internship / job postings into a strict JSON schema.

Read the input — it could be plain text, a copy-pasted job description, an email, or part of a PDF — and produce ONE JSON object with these keys:

{
  "companyName": string,                    // organisation hiring
  "website": string,                        // company website url, or "" if unknown
  "title": string,                          // role title
  "duration": string,                       // e.g. "4 months", "Summer 2026", "1 year"
  "hours": string,                          // e.g. "Full-time, ~40 hrs/week"
  "location": string,                       // e.g. "Toronto, ON" or "Remote — Canada"
  "type": string,                           // e.g. "Internship", "Co-op", "Full-time"
  "compensation": string,                   // e.g. "$25/hr", "Paid", "Unpaid"
  "deadline": string,                       // YYYY-MM-DD if explicit, else ""
  "keySkills": string[],                    // up to 5 most-relevant hard skills, in priority order
  "positionDetails": string                 // multi-paragraph description, kept faithful to source. Strip headers like "Position Details:" — just the body.
}

Rules:
- Output ONLY the JSON object. No markdown fences, no commentary.
- If a field can't be inferred, use "" (empty string) for strings or [] for arrays.
- Do not invent details. If location says "remote" without country, just write "Remote".
- positionDetails should preserve paragraphs with \\n\\n.`;

export async function POST(req: NextRequest) {
  // Posting AI-parse is open to employer + admin + superadmin so the
  // inline new-posting composer on /employer can autofill from a
  // pasted JD.
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role ?? "";
  if (!["employer", "admin", "superadmin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!AI_CONFIGURED.chat) {
    return NextResponse.json(
      { error: "AI parser is not configured (set CF_AI_TOKEN or GEMINI_API_KEY)." },
      { status: 503 }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  let rawAi: string;

  if (contentType.startsWith("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart payload." }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file in upload." }, { status: 400 });
    }
    if (file.size > MAX_FILE) {
      return NextResponse.json(
        { error: `File is ${(file.size / 1_048_576).toFixed(1)} MB; max is 20 MB.` },
        { status: 413 }
      );
    }
    // Some browsers report .docx with a generic mime — fall back to
    // extension match so a clean .docx upload still goes through.
    const isDocx =
      file.type === DOCX_MIME || /\.docx$/i.test(file.name);
    if (!ACCEPTED_FILE_TYPES.has(file.type) && !isDocx) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type || file.name}". Try PDF, DOCX, image, or plain text.` },
        { status: 415 }
      );
    }

    try {
      if (isDocx) {
        // .docx — extract text with mammoth (pure JS, no native deps),
        // then route through Cloudflare Llama like the PDF path.
        const buf = Buffer.from(await file.arrayBuffer());
        const mammoth = (await import("mammoth")).default;
        const { value: docxText } = await mammoth.extractRawText({ buffer: buf });
        if (!docxText || docxText.trim().length < 30) {
          return NextResponse.json(
            { error: "Couldn't pull readable text from this DOCX." },
            { status: 422 }
          );
        }
        rawAi = await callCloudflareText(docxText.slice(0, 12000));
      } else if (file.type === "application/pdf") {
        // PDFs: extract text server-side with unpdf, then feed through
        // Cloudflare Llama via the existing chat() helper. Keeps us on
        // the free Cloudflare Workers AI tier — no Gemini quota needed.
        const buf = new Uint8Array(await file.arrayBuffer());
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(buf);
        const { text } = await extractText(pdf, { mergePages: true });
        const flat = Array.isArray(text) ? text.join("\n\n") : text;
        if (!flat || flat.trim().length < 30) {
          return NextResponse.json(
            { error: "Couldn't pull readable text from this PDF (may be scanned-only). Try an image instead." },
            { status: 422 }
          );
        }
        rawAi = await callCloudflareText(flat.slice(0, 12000));
      } else if (file.type.startsWith("image/")) {
        // Images: Cloudflare Llama 3.2 Vision (free tier).
        if (!CF_TOKEN || !CF_ACCOUNT) {
          return NextResponse.json(
            { error: "Image parsing needs CF_AI_TOKEN + CF_ACCOUNT_ID." },
            { status: 503 }
          );
        }
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        rawAi = await callCloudflareVision(bytes);
      } else {
        // text/plain, text/markdown, text/html — read directly.
        const text = await file.text();
        rawAi = await callCloudflareText(text.slice(0, 12000));
      }
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message || "AI parse failed." },
        { status: 502 }
      );
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = (body.text ?? "").trim();
    if (text.length < 30) {
      return NextResponse.json(
        { error: "Paste at least 30 characters of job description for the AI to parse." },
        { status: 400 }
      );
    }
    try {
      rawAi = await callCloudflareText(text.slice(0, 12000));
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message || "AI parse failed." },
        { status: 502 }
      );
    }
  }

  // Models routinely add preamble ("Here is the JSON:") or trailing
  // commentary, plus the occasional ```json fence. Pull the first
  // balanced { … } block out of the response and try to parse that.
  const cleaned = extractJson(rawAi);

  let parsed: Parsed;
  try {
    parsed = JSON.parse(cleaned) as Parsed;
  } catch {
    return NextResponse.json(
      {
        error: "AI returned non-JSON. Try editing the source and parsing again.",
        raw: rawAi.slice(0, 1200),
      },
      { status: 502 }
    );
  }

  // Coerce + clamp.
  const safe: Parsed = {
    companyName: String(parsed.companyName ?? "").trim(),
    website: String(parsed.website ?? "").trim(),
    title: String(parsed.title ?? "").trim(),
    duration: String(parsed.duration ?? "").trim(),
    hours: String(parsed.hours ?? "").trim(),
    location: String(parsed.location ?? "").trim(),
    type: String(parsed.type ?? "").trim(),
    compensation: String(parsed.compensation ?? "").trim(),
    deadline: String(parsed.deadline ?? "").trim(),
    keySkills: Array.isArray(parsed.keySkills)
      ? parsed.keySkills.map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
      : [],
    positionDetails: String(parsed.positionDetails ?? "").trim(),
  };

  return NextResponse.json({ ok: true, posting: safe });
}

/**
 * Send a chunk of text to Cloudflare's Llama 3.3 70B (Fast) model with
 * the SYSTEM prompt. Bigger model than the default chat() helper, picked
 * specifically because Llama 3.1 8B was unreliable at "return ONLY JSON".
 */
async function callCloudflareText(input: string): Promise<string> {
  if (!CF_TOKEN || !CF_ACCOUNT) {
    throw new Error("AI not configured (set CF_AI_TOKEN + CF_ACCOUNT_ID).");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${STRUCTURED_MODEL}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: input },
      ],
      max_tokens: 1500,
      temperature: 0.05,
      // Cloudflare honours response_format on Llama 3.3 — request raw
      // JSON object so the model is biased toward valid output.
      response_format: { type: "json_object" },
    }),
  });
  const j = await res.json();
  if (!j.success) {
    const msg = j.errors?.[0]?.message ?? j.messages?.[0]?.message ?? "Cloudflare AI call failed";
    throw new Error(msg);
  }
  // Newer CF models return `response` as a parsed object for JSON output;
  // normalize to a string so .trim()/JSON.parse downstream don't throw.
  const raw261 = j.result?.response;
  const text = typeof raw261 === "string" ? raw261 : raw261 != null ? JSON.stringify(raw261) : "";
  if (!text.trim()) throw new Error("Cloudflare AI returned an empty response.");
  return text;
}

/**
 * Pull the first balanced JSON object out of arbitrary model output —
 * handles preamble ("Here is the JSON:"), code fences, and trailing
 * commentary. Falls back to fence-stripping if no { … } is found.
 */
function extractJson(text: string): string {
  const fenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  // Walk the string tracking brace depth (respecting strings/escapes)
  // so a substring like {"a":"}"} doesn't trip us up.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < fenced.length; i++) {
    const ch = fenced[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        return fenced.slice(start, i + 1);
      }
    }
  }
  return fenced;
}

/**
 * Send an image to Cloudflare Workers AI's Llama 3.2 11B Vision model.
 * Free tier — no Google billing required. Returns raw text that should
 * be JSON (parsed and coerced by the caller).
 */
async function callCloudflareVision(imageBytes: number[]): Promise<string> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: imageBytes,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            "Read the attached image and produce ONLY the JSON object described in the system instruction. No prose, no fences.",
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });
  const j = await res.json();
  if (!j.success) {
    const msg = j.errors?.[0]?.message ?? j.messages?.[0]?.message ?? "Cloudflare Vision call failed";
    throw new Error(msg);
  }
  const raw336 = j.result?.response ?? j.result?.description;
  const text = typeof raw336 === "string" ? raw336 : raw336 != null ? JSON.stringify(raw336) : "";
  if (!text.trim()) throw new Error("Cloudflare Vision returned an empty response.");
  return text;
}
