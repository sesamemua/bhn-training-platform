/**
 * Resume linter — POST endpoint that ships the structured resume to
 * the AI adapter and returns a typed list of issues anchored back to
 * the text-bearing node they came from.
 *
 *   POST /api/profile/resume/lint
 *     body: { content: ResumeContent }
 *     resp: { ok: true, issues: LintIssue[] } | { error }
 *
 * Stateless — no DB writes. The client decides whether to apply any
 * suggested fixes (which would route through the normal auto-save).
 *
 * Companion to /lib/resume/lint.ts which owns the types + prompt.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { callText } from "@/lib/ai/reliability";
import { buildLintPrompt, parseLintResponse } from "@/lib/resume/lint";
import type { ResumeContent } from "@/lib/resume/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id ?? null;

  const body = (await req.json().catch(() => ({}))) as {
    content?: ResumeContent;
  };
  if (!body.content || typeof body.content !== "object" || !Array.isArray(body.content.sections)) {
    return NextResponse.json({ error: "content (ResumeContent) required" }, { status: 400 });
  }

  // Defensive size cap — the serialised JSON shouldn't be enormous.
  // 60kb is generous; most full resumes serialise to <20kb.
  const serialised = JSON.stringify(body.content);
  if (serialised.length > 60_000) {
    return NextResponse.json(
      { error: "Resume content too large to lint (max 60kb serialised)" },
      { status: 413 },
    );
  }

  const { system, user } = buildLintPrompt(body.content);
  const result = await callText(
    [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
    { userId, feature: "resume_lint", maxTokens: 4000 },
  );
  if (!result.ok || !result.text) {
    return NextResponse.json(
      { error: result.ok ? "Empty AI response — try again." : result.error },
      { status: 502 },
    );
  }
  const issues = parseLintResponse(result.text);
  return NextResponse.json({ ok: true, issues });
}
