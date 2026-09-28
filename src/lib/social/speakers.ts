import type { PrismaClient } from "@prisma/client";
import { withSocialTags } from "./tags";

export const SYMPOSIUM_SOCIAL_STREAM = "symposium_2026";
export const SYMPOSIUM_REGISTRATION_URL = "https://luma.com/wh30nh1n";

export interface HighlightSpeaker {
  id: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  bio: string | null;
  photoUrl: string | null;
  sessionTitle: string | null;
}

export function speakerPostKey(id: string): string {
  return `${SYMPOSIUM_SOCIAL_STREAM}:speaker:${id}:0`;
}

function cleanBio(speaker: HighlightSpeaker): string {
  return (speaker.bio ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSpeakerPost(speaker: HighlightSpeaker, bio: string, tagged: boolean): string {
  const name = speaker.fullName.trim();
  const mention = tagged ? `@${name}` : name;
  const title = speaker.title?.trim();
  const organization = speaker.organization?.trim();
  const introduction = title && organization
    ? `Meet ${mention}, ${title} at ${organization}.`
    : title ? `Meet ${mention}, ${title}.`
    : organization ? `Meet ${mention} from ${organization}.`
    : `Meet ${mention}.`;

  return [
    introduction,
    bio,
    speaker.sessionTitle?.trim() ? `Hear from ${mention} in "${speaker.sessionTitle.trim()}".` : "",
    "Join us at the BioHubNet 2026 Annual Symposium on October 29 at the Chelsea Hotel in Toronto.",
    `Register for the symposium: ${SYMPOSIUM_REGISTRATION_URL}`,
    "#BioHubNet #LifeSciences #Biomanufacturing",
  ].filter(Boolean).join("\n\n");
}

export function draftSpeakerPost(speaker: HighlightSpeaker): string {
  return withSocialTags(formatSpeakerPost(speaker, cleanBio(speaker), true));
}

function previousSpeakerPost(speaker: HighlightSpeaker): string {
  const bio = cleanBio(speaker);
  const excerpt = bio.length <= 280
    ? bio
    : `${bio.slice(0, 280).replace(/\s+\S*$/, "").trimEnd()}...`;
  return formatSpeakerPost(speaker, excerpt, false);
}

/** Create missing drafts and refresh only untouched legacy copy. */
export async function syncSpeakerHighlights(
  prisma: PrismaClient,
  speakers: HighlightSpeaker[],
  now: Date,
): Promise<number> {
  const ready = speakers.filter((speaker) =>
    speaker.fullName.trim() && speaker.bio?.trim() && speaker.photoUrl?.trim(),
  );
  if (ready.length === 0) return 0;

  const result = await prisma.socialPost.createMany({
    data: ready.map((speaker) => ({
      stream: SYMPOSIUM_SOCIAL_STREAM,
      kind: "speaker",
      deadlineId: speaker.id,
      daysBefore: 0,
      key: speakerPostKey(speaker.id),
      body: draftSpeakerPost(speaker),
      assetSpec: { version: 1, template: "symposium-speaker" },
      scheduledFor: now,
    })),
    skipDuplicates: true,
  });

  const existing = await prisma.socialPost.findMany({
    where: { key: { in: ready.map((speaker) => speakerPostKey(speaker.id)) }, status: "draft" },
    select: { id: true, key: true, body: true },
  });
  const byKey = new Map(ready.map((speaker) => [speakerPostKey(speaker.id), speaker]));
  for (const post of existing) {
    const speaker = byKey.get(post.key);
    if (!speaker || post.body !== previousSpeakerPost(speaker)) continue;
    await prisma.socialPost.updateMany({
      where: { id: post.id, status: "draft", body: post.body },
      data: { body: draftSpeakerPost(speaker) },
    });
  }
  return result.count;
}
