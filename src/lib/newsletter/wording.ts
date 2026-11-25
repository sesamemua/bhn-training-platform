import type { PieceLayout, Section } from "./types";

/** Editorial policy, never owned by AI output. Absent means the usual AI layout. */
export type PreserveWording = Partial<Record<Section, boolean>>;

/** No headline extraction, truncation, punctuation changes or model call. */
export function verbatimLayout(rawBody: string, sourceUrl?: string | null): PieceLayout {
  return { headline: "", body: [], verbatimBody: rawBody, ctaUrl: sourceUrl ?? undefined };
}
