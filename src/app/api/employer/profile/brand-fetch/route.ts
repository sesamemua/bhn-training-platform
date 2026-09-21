/**
 * POST /api/employer/profile/brand-fetch
 *
 * Detect a company's brand colours from its homepage. Two passes:
 *
 *   1. MECHANICAL — regex-scan the HTML for the signals that
 *      brand-aware sites surface deliberately:
 *        • <meta name="theme-color" content="#RRGGBB">
 *        • CSS custom properties in inline <style> blocks
 *          (--primary, --brand, --brand-primary, --accent, …)
 *        • <link rel="mask-icon" color="#RRGGBB"> (Safari hint)
 *      First hit wins for each role.
 *
 *   2. AI FALLBACK — when mechanical pass yields no primary, ask
 *      the chat LLM with the page's <title> + meta description +
 *      condensed visible text. Prompt asks for hex triples; we
 *      validate the response and merge what looks safe.
 *
 * Persists nothing. The modal applies the result + saves through
 * the existing PATCH /api/employer/profile.
 *
 * Body:    { website: string }
 * Response:
 *   { ok: true,
 *     brand: { primary?, secondary?, accent? } | null,
 *     source: "mechanical" | "ai" | "none",
 *     signals: { themeColor?: string, cssVars?: number, maskIcon?: string } }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { AI_CONFIGURED } from "@/lib/ai";
import { callStructured } from "@/lib/ai/reliability";
import { fetchHomepageHtml } from "@/lib/employer/logo-discovery";
import { isHexColor, type CompanyBrand } from "@/lib/employer/brand";

export const runtime = "nodejs";

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** Expand a 3-digit shorthand to 6 digits and uppercase the hex. */
function normalizeHex(h: string): string | null {
  let s = h.trim();
  if (!s.startsWith("#")) s = "#" + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  return null;
}

function extractMechanicalBrand(html: string): {
  brand: CompanyBrand;
  signals: { themeColor?: string; cssVars?: number; maskIcon?: string };
} {
  const brand: CompanyBrand = {};
  const signals: { themeColor?: string; cssVars?: number; maskIcon?: string } = {};

  // 1. <meta name="theme-color">
  const themeColor =
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i.exec(html)?.[1];
  if (themeColor) {
    const hex = normalizeHex(themeColor);
    if (hex) {
      brand.primary = hex;
      signals.themeColor = hex;
    }
  }

  // 2. mask-icon color
  const maskColor =
    /<link[^>]+rel=["']mask-icon["'][^>]+color=["']([^"']+)["']/i.exec(html)?.[1];
  if (maskColor) {
    const hex = normalizeHex(maskColor);
    if (hex) {
      signals.maskIcon = hex;
      if (!brand.primary) brand.primary = hex;
    }
  }

  // 3. CSS custom properties — scan inline <style> blocks for the
  //    common naming patterns brand-aware sites use. We collect into
  //    role buckets and pick the first non-empty for each.
  const stylesMatches = [
    ...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
  ];
  const styleBlob = stylesMatches.map((m) => m[1]).join("\n");
  if (styleBlob) {
    type Bucket = "primary" | "secondary" | "accent";
    const buckets: Record<Bucket, string | undefined> = {
      primary: undefined,
      secondary: undefined,
      accent: undefined,
    };
    const patterns: { re: RegExp; bucket: Bucket }[] = [
      { re: /--(?:brand|primary|color-primary|brand-primary|primary-color)\s*:\s*([^;\n]+)/gi, bucket: "primary" },
      { re: /--(?:secondary|color-secondary|brand-secondary|secondary-color)\s*:\s*([^;\n]+)/gi, bucket: "secondary" },
      { re: /--(?:accent|color-accent|brand-accent|accent-color|highlight)\s*:\s*([^;\n]+)/gi, bucket: "accent" },
    ];
    let cssVars = 0;
    for (const { re, bucket } of patterns) {
      for (const m of styleBlob.matchAll(re)) {
        const val = m[1].trim();
        // Only handle direct hex literals — `rgb()` / `hsl()` /
        // `var(--…)` indirection is too noisy to chase here.
        const hex = /#[0-9a-fA-F]{3,6}\b/.exec(val)?.[0];
        if (!hex) continue;
        const norm = normalizeHex(hex);
        if (!norm) continue;
        cssVars++;
        if (!buckets[bucket]) buckets[bucket] = norm;
      }
    }
    if (buckets.primary && !brand.primary) brand.primary = buckets.primary;
    if (buckets.secondary && !brand.secondary) brand.secondary = buckets.secondary;
    if (buckets.accent && !brand.accent) brand.accent = buckets.accent;
    if (cssVars > 0) signals.cssVars = cssVars;
  }

  return { brand, signals };
}

/** Strip HTML to plain text and cap at ~3 KB so the LLM prompt
 *  stays cheap. Mirrors the auto-fill route's helper. */
function extractTextForAi(html: string): string {
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const desc =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    ?? "";
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  return [title && `Title: ${title}`, desc && `Description: ${desc}`, stripped]
    .filter(Boolean).join("\n\n");
}

const AI_SYSTEM = `You identify a company's brand colours from its website.

Return ONLY a JSON object with these keys (empty string if unknown):

{
  "primary":   "#RRGGBB",   // the dominant brand colour
  "secondary": "#RRGGBB",   // a companion colour used with primary
  "accent":    "#RRGGBB"    // a third colour used for call-outs / highlights
}

Rules:
- Output ONLY the JSON. No prose, no markdown fences.
- Hex must be 6-digit "#RRGGBB". Reject named colours, rgb(), or 3-digit shorthand in your output.
- Don't invent. Leave a field empty rather than guess.
- Avoid plain white (#FFFFFF) and plain black (#000000) — those are
  almost always background / text, not brand.`;

/**
 * Lenient schema matching the old `Partial<Record<keyof CompanyBrand, string>>`
 * parse target. Validation only gates "is this a JSON object of optional
 * string fields" — exactly as the old `JSON.parse` did. Per-field hex
 * validity is still enforced downstream by `isHexColor`, so empty strings or
 * malformed values pass the schema and get dropped there (preserving the old
 * behaviour where the model returns "" for unknown fields).
 */
const AiBrandSchema = z.object({
  primary: z.string().optional(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  style: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  if (!session || (role !== "employer" && !["admin", "superadmin"].includes(role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { website?: string };
  const url = normalizeUrl(body.website ?? "");
  if (!url) {
    return NextResponse.json({ error: "Enter a valid company website." }, { status: 400 });
  }

  const html = await fetchHomepageHtml(url);
  const { brand: mech, signals } = html
    ? extractMechanicalBrand(html)
    : { brand: {} as CompanyBrand, signals: {} };

  // If mechanical pass found a primary, we're done — fast path that
  // skips the AI call and its token cost.
  if (mech.primary) {
    return NextResponse.json({
      ok: true,
      brand: mech,
      source: "mechanical" as const,
      signals,
    });
  }

  // Fallback: ask the LLM. Skip if AI isn't configured.
  if (!html || !AI_CONFIGURED.chat) {
    return NextResponse.json({
      ok: true,
      brand: Object.keys(mech).length > 0 ? mech : null,
      source: "none" as const,
      signals,
    });
  }

  const pageText = extractTextForAi(html);
  const aiInput = `Website URL: ${url.toString()}\n\nPage content:\n${pageText}`;
  const result = await callStructured(
    [
      { role: "system", content: AI_SYSTEM },
      { role: "user", content: aiInput },
    ],
    AiBrandSchema,
    { feature: "employer_brand_detect", maxTokens: 200, temperature: 0.1 },
  );
  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      brand: Object.keys(mech).length > 0 ? mech : null,
      source: "none" as const,
      signals,
    });
  }

  // Keep only valid hex triples — same lenient filter as before.
  const parsed = result.data;
  const aiBrand: CompanyBrand = {};
  if (isHexColor(parsed.primary)) aiBrand.primary = parsed.primary;
  if (isHexColor(parsed.secondary)) aiBrand.secondary = parsed.secondary;
  if (isHexColor(parsed.accent)) aiBrand.accent = parsed.accent;

  // Merge: mechanical wins where set, AI fills the rest.
  const merged: CompanyBrand = {
    ...aiBrand,
    ...mech,
  };

  return NextResponse.json({
    ok: true,
    brand: Object.keys(merged).length > 0 ? merged : null,
    source: aiBrand.primary ? ("ai" as const) : ("none" as const),
    signals,
  });
}
