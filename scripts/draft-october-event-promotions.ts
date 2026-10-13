import { createRequire } from "node:module";
// @ts-expect-error Available in the installed Node runtime, ahead of the repo's types.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { withSocialTags } from "../src/lib/social/tags";
import { OCTOBER_PROMOTIONS } from "./data/october-event-promotions";

// Resolve Next's server marker for this one-off, server-side content import.
const emptyMarker = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
const hooks = registerHooks({ resolve(specifier: string, context: unknown, next: (s: string, c: unknown) => unknown) {
  return specifier === "server-only" ? { url: emptyMarker, shortCircuit: true } : next(specifier, context);
} });

async function main() {
  const { loadCapacityMonitor } = await import("../src/lib/training-week/capacity-server");
  const checkedAt = new Date();
  const monitor = await loadCapacityMonitor();
  const eligible = OCTOBER_PROMOTIONS.filter((post) => {
    if (!post.workshopSlug) return true;
    const session = monitor.find((row) => row.slug === post.workshopSlug);
    return session?.registration?.state === "open" && session.cap.projectedApproved < session.cap.capacity;
  });
  const data = eligible.map((post) => ({
    stream: "events", kind: "event", deadlineId: post.slug,
    key: `events:event:${post.slug}:0`, status: "draft", trackChanges: true,
    body: withSocialTags(post.body), scheduledFor: new Date(post.suggestedDate),
    assetSpec: { title: post.title, campaign: "2026-symposium-training-week", sourceUrl: post.sourceUrl,
      graphicBrief: post.graphicBrief, capacityCheckedAt: checkedAt.toISOString(),
      reviewNote: "Draft only. Recheck workshop availability and registration wording before sharing. @ names require selecting the real LinkedIn profiles when publishing." },
  }));
  if (!data.length) throw new Error("No eligible draft posts.");
  console.log(JSON.stringify({ apply: process.argv.includes("--apply"),
    posts: data.map((p) => ({ key: p.key, title: p.assetSpec.title, characters: p.body.length })),
    capacity: monitor.map((s) => ({ title: s.title, state: s.registration?.state,
      projectedRemaining: Math.max(0, s.cap.capacity - s.cap.projectedApproved) })),
  }, null, 2));
  if (!process.argv.includes("--apply")) return;
  // Creation only: never rewrite colleagues' edits, approve, or send to a network.
  const result = await prisma.socialPost.createMany({ data, skipDuplicates: true });
  const saved = await prisma.socialPost.findMany({ where: { key: { in: data.map((p) => p.key) } },
    select: { id: true, key: true, status: true, body: true, assetSpec: true } });
  if (saved.length !== data.length) throw new Error("Draft read-back did not match the requested set.");
  await mkdir("deliverables/social-october-2026", { recursive: true });
  await writeFile("deliverables/social-october-2026/drafts.md", [
    "# Symposium and Training Week promotion drafts", "", `Prepared ${checkedAt.toISOString()}. Saved to Marketing > Social > Events.`, "",
    "Suggested dates are planning cues only; all new posts are drafts, not scheduled for publishing.", "",
    ...saved.flatMap((p) => [`## ${(p.assetSpec as { title: string }).title}`, "", p.body, ""]),
  ].join("\n"));
  console.log(JSON.stringify({ created: result.count, verifiedDrafts: saved.map((p) => ({ id: p.id, status: p.status })) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { hooks.deregister(); await prisma.$disconnect(); });
