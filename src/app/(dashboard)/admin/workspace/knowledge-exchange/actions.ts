"use server";

/**
 * The team's side of the Knowledge Exchange awardee intake: which round
 * an awardee is filed under, the two settings, and removing a submission.
 *
 * Results rather than thrown errors: a server action's error message does
 * not reach the browser in production.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl } from "@/lib/r2";
import {
  CURRENT_ROUND_KEY,
  QUOTE_MAX_WORDS,
  QUOTE_MIN_WORDS,
  QUOTE_WORDS_KEY,
  clampQuoteWords,
  parseRound,
} from "@/lib/knowledge-exchange/intake";

const HERE = "/admin/workspace/knowledge-exchange";

type Result = { ok: true } | { ok: false; error: string };

const saveSetting = (key: string, value: string) =>
  prisma.platformSetting.upsert({ where: { key }, update: { value }, create: { key, value } });

export async function setAwardeeRound(id: string, round: number): Promise<Result> {
  await requireRole("admin");
  const r = parseRound(round);
  if (r === null) return { ok: false, error: "A round is a whole number from 1 to 99." };
  await prisma.knowledgeExchangeAwardee.update({ where: { id }, data: { round: r } });
  revalidatePath(HERE);
  return { ok: true };
}

/** The round new submissions are filed under. */
export async function setCurrentRound(round: number): Promise<Result> {
  await requireRole("admin");
  const r = parseRound(round);
  if (r === null) return { ok: false, error: "A round is a whole number from 1 to 99." };
  await saveSetting(CURRENT_ROUND_KEY, String(r));
  revalidatePath(HERE);
  return { ok: true };
}

export async function setQuoteLimit(words: number): Promise<{ ok: true; words: number } | { ok: false; error: string }> {
  await requireRole("admin");
  const n = clampQuoteWords(words);
  if (n === null) return { ok: false, error: `Enter a number of words from ${QUOTE_MIN_WORDS} to ${QUOTE_MAX_WORDS}.` };
  await saveSetting(QUOTE_WORDS_KEY, String(n));
  revalidatePath(HERE);
  revalidatePath("/knowledge-exchange/awardee");
  return { ok: true, words: n };
}

export async function deleteAwardee(id: string): Promise<Result> {
  await requireRole("admin");
  const row = await prisma.knowledgeExchangeAwardee.delete({ where: { id }, select: { photoUrl: true } });
  await deleteR2ObjectByUrl(row.photoUrl);
  revalidatePath(HERE);
  return { ok: true };
}
