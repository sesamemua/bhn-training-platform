import { z } from "zod";
import { PagesSchema, pagesOf } from "./types";

const Version = z.object({ round: z.number().int().positive(), pages: PagesSchema });
export type DesignVersion = z.infer<typeof Version>;

export function designVersions(raw: unknown): DesignVersion[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const parsed = Version.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }).sort((a, b) => a.round - b.round);
}

export function archiveDesignRound(current: { round: number; pages: unknown; versions: unknown }) {
  const versions = designVersions(current.versions);
  const pages = pagesOf(current.pages);
  return pages.length && !versions.some((version) => version.round === current.round)
    ? [...versions, { round: current.round, pages }]
    : versions;
}

export function allDesignPages(current: { pages: unknown; versions: unknown }) {
  return [...new Map([...pagesOf(current.pages), ...designVersions(current.versions).flatMap((version) => version.pages)]
    .map((page) => [page.key, page])).values()];
}
