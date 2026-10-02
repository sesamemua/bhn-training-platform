/**
 * Testimonials through a showcase link: a few guide questions, each answered
 * by typing (about a minute's worth) or with a recording of up to a minute.
 * Recordings are transcribed on upload; on submit, AI drafts one short quote
 * from everything they said, for the team to edit.
 *
 * Pure: schemas, limits and the quote prompt. No Prisma, no network.
 */
import { z } from "zod";

/** About a minute of speech, typed. */
export const MAX_TEXT_WORDS = 150;
export const MAX_AUDIO_SECONDS = 60;
/** A minute of compressed speech is well under 1 MB; this is the ceiling. */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a", "audio/aac": "aac",
};
/** "audio/webm;codecs=opus" → "audio/webm". */
export const baseType = (t: string) => t.split(";")[0].trim().toLowerCase();

export const QuestionsSchema = z.array(z.string().trim().min(3).max(300)).min(1).max(12);

export const AnswerSchema = z.object({
  question: z.string().trim().min(1).max(300),
  text: z.string().trim().max(2000).optional(),
  audioKey: z.string().max(300).optional(),
  transcript: z.string().trim().max(3000).optional(),
}).refine((a) => !!a.text || !!a.audioKey, { message: "An answer needs words or a recording." });
export type Answer = z.infer<typeof AnswerSchema>;

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Problems with a set of answers against the link's questions; empty when fine. */
export function answerProblems(answers: Answer[], questions: string[], slug: string): string[] {
  const out: string[] = [];
  if (!answers.length) out.push("Answer at least one question.");
  const seen = new Set<string>();
  for (const a of answers) {
    if (!questions.includes(a.question)) { out.push("One of the answers is to a question this form does not ask."); continue; }
    if (seen.has(a.question)) out.push(`“${a.question}” is answered twice.`);
    seen.add(a.question);
    if (a.text && wordCount(a.text) > MAX_TEXT_WORDS) out.push(`Keep each typed answer to ${MAX_TEXT_WORDS} words (about a minute) — “${a.question}” has ${wordCount(a.text)}.`);
    if (a.audioKey && !a.audioKey.startsWith(`showcase/${slug}/audio/`)) out.push("A recording did not come from this form.");
  }
  return out;
}

/** What they said, question by question — typed words, or the transcript of the recording. */
export const spoken = (answers: Answer[]) =>
  answers.map((a) => `Q: ${a.question}\nA: ${(a.text || a.transcript || "").trim() || "(no words)"}`).join("\n\n");

export function quotePrompt(name: string, programs: string[], answers: Answer[]) {
  return [
    {
      role: "system" as const,
      content:
        "You turn a trainee's answers about BioHubNet (a Canadian biomanufacturing training network with programmes ENGAGE, EXPERIENCE and EQUIP) into ONE short testimonial quote for social media, the website and a newsletter. " +
        "Rules: 1–3 sentences, at most 45 words, first person, in their own words and voice — keep their phrases, fix only filler and grammar. " +
        "Do not invent facts, numbers, names or programmes they did not mention. No hashtags, no emojis, no surrounding quotation marks. Reply with the quote only.",
    },
    {
      role: "user" as const,
      content: `Trainee: ${name}${programs.length ? ` (programme: ${programs.join(", ")})` : ""}\n\n${spoken(answers).slice(0, 6000)}`,
    },
  ];
}

/** Tidy what the model sent back into a quote. */
export const cleanQuote = (t: string) =>
  t.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").replace(/\s+/g, " ").slice(0, 600);
