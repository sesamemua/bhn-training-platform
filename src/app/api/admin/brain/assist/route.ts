/**
 * POST /api/admin/brain/assist — help me write this.
 *
 * Proposes a subject and body for a brain pick. Nothing is saved and
 * nothing is sent: the draft lands back in the form for a person to edit
 * and then send, the same arrangement as the outreach template assistant.
 *
 * The prompt is aimed at making the request cheap to ANSWER rather than
 * pleasant to read — a vague ask is how five minutes becomes an
 * afternoon, and this page is otherwise entirely about the cost of
 * asking. See BRAIN_PICK_ASSIST in src/lib/ai/prompts.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AI_CONFIGURED } from "@/lib/ai";
import { callStructured, delimitContext } from "@/lib/ai/reliability";
import { BRAIN_PICK_ASSIST } from "@/lib/ai/prompts";
import {
  KIND_LABEL, NOTHING, draftedFor, firstNameOf, subjectIsUseless, tidyDraftBody,
  type PickKind,
} from "@/lib/brain/picker";
import { TEAM_ROLES } from "@/lib/brain/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  askedOfIds: z.array(z.string().min(1).max(100)).min(1).max(50),
  kind: z.enum(["question", "task", "favour"]).default("question"),
  /** Whatever they have typed so far — a note, half a sentence, nothing. */
  gist: z.string().trim().max(1_000).default(""),
  subject: z.string().trim().max(200).default(""),
  bribe: z.string().trim().max(160).default(NOTHING),
});

const Draft = z.object({
  subject: z.string().min(2).max(200),
  body: z.string().min(2).max(2_000),
});

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!AI_CONFIGURED.chat) {
    return NextResponse.json({ error: "No AI provider is configured, so this one is on you." }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pick who you are asking first." }, { status: 400 });
  const d = parsed.data;

  const [recipients, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: d.askedOfIds }, isActive: true, accountKind: "real", role: { in: [...TEAM_ROLES] } },
      select: { id: true, name: true, email: true },
    }).catch(() => []),
    prisma.brainProfile.findMany({
      where: { userId: { in: d.askedOfIds } },
      select: { userId: true, speciality: true },
    }).catch(() => []),
  ]);
  if (recipients.length === 0) return NextResponse.json({ error: "That is not a colleague." }, { status: 404 });

  const specialityOf = new Map(profiles.map((p) => [p.userId, p.speciality] as const));
  const who = recipients
    .map((r) => `- ${r.name ?? r.email}: ${specialityOf.get(r.id) ?? draftedFor(r.email).speciality}`)
    .join("\n");

  // The sender's own words are untrusted input to the model, so they go
  // through the same neutraliser the RAG paths use.
  const context = [
    `You are writing to ${recipients.length === 1 ? "one colleague" : `${recipients.length} colleagues at once`}:`,
    who,
    "",
    `Type of request: ${KIND_LABEL[d.kind as PickKind]}`,
    d.bribe.trim().toLowerCase() === NOTHING
      ? "The sender is offering nothing in return. Do not promise anything on their behalf."
      : `The sender is offering: ${d.bribe}. You may mention it once, lightly.`,
    d.subject ? `Draft subject so far: ${d.subject}` : "",
    d.gist ? `What the sender has said so far:\n${d.gist}` : "The sender has not written anything yet.",
  ].filter(Boolean).join("\n");

  const res = await callStructured(
    [
      { role: "system", content: BRAIN_PICK_ASSIST.system },
      { role: "user", content: delimitContext("CONTEXT", context) },
    ],
    Draft,
    {
      userId,
      feature: "brain_pick_assist",
      promptVersion: BRAIN_PICK_ASSIST.version,
      maxTokens: 500,
      temperature: 0.55,
    },
  );
  if (!res.ok) {
    return NextResponse.json({ error: `The AI could not help just now (${res.error}). Write it yourself.` }, { status: 502 });
  }

  // The model opens with a greeting every time however firmly the prompt
  // forbids one, so it is removed here rather than hoped away.
  const names = recipients.map((r) => firstNameOf(r.name, ""));
  const body = tidyDraftBody(res.data.body, names);
  if (!body) {
    return NextResponse.json({ error: "The AI returned only a greeting. Try again." }, { status: 422 });
  }
  return NextResponse.json({
    draft: { subject: res.data.subject.trim(), body },
    // A subject naming a category rather than the thing is no subject;
    // the form nudges rather than silently accepting it.
    weakSubject: subjectIsUseless(res.data.subject),
  });
}
