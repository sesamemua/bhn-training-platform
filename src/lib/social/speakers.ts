import type { PrismaClient } from "@prisma/client";

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

export function draftSpeakerPost(speaker: HighlightSpeaker): string {
  const name = speaker.fullName.trim();
  const title = speaker.title?.trim();
  const organization = speaker.organization?.trim();
  const introduction = title && organization
    ? `Meet ${name}, ${title} at ${organization}.`
    : title ? `Meet ${name}, ${title}.`
    : organization ? `Meet ${name} from ${organization}.`
    : `Meet ${name}.`;
  const bio = (speaker.bio ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const excerpt = bio.length <= 280
    ? bio
    : `${bio.slice(0, 280).replace(/\s+\S*$/, "").trimEnd()}...`;

  return [
    introduction,
    excerpt,
    speaker.sessionTitle?.trim() ? `Hear from ${name} in "${speaker.sessionTitle.trim()}".` : "",
    "Join us at the BioHubNet 2026 Annual Symposium on October 29 at the Chelsea Hotel in Toronto.",
    `Register for the symposium: ${SYMPOSIUM_REGISTRATION_URL}`,
    "#BioHubNet #LifeSciences #Biomanufacturing",
  ].filter(Boolean).join("\n\n");
}

/** Create only missing drafts. Existing edits and approvals are never regenerated. */
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
  return result.count;
}
