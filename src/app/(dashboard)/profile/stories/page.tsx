import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Plus, ArrowRight, Sparkles } from "lucide-react";
import { getSession, isStaff as checkIsStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StoryBankClient } from "@/components/prep/StoryBankClient";
import { StoryBuilder } from "@/components/prep/StoryBuilder";
import { DemoSeedAndClearTray } from "@/components/admin/DemoSeedAndClearTray";
import { PageHero } from "@/components/ui/PageHero";

/**
 * /profile/stories — reusable STAR Story Bank.
 *
 * Surfaces every StarStory the trainee has authored, with inline
 * edit + delete. The bank is the source of truth — when a trainee
 * polishes a STAR draft in the prep flow and clicks "Save to Bank",
 * the story lives here. A future prep session for a new posting can
 * pick from the bank rather than starting from scratch.
 *
 * Privacy: stories are user-private. No employer or admin can see
 * the contents of a trainee's Story Bank. (Admin can see metadata
 * via /admin/audit for moderation purposes, but the body text isn't
 * surfaced anywhere outside this page.)
 *
 * Layout (rev 2026-05-17):
 *   One outer rounded-3xl panel with a gentle top-to-bottom brand
 *   wash. Inside, four sections (header / admin demo / content /
 *   help) are separated by hairline `border-b border-line` rules
 *   rather than nested card boxes. Each section gets a faint
 *   gradient tint of its own so the eye can pick out the boundaries
 *   without the chrome of stacked rounded cards. Pattern lifted
 *   from the /employer HR-overview brand stage.
 */
export const dynamic = "force-dynamic";

const OUTER_BG =
  "linear-gradient(180deg, color-mix(in srgb, var(--brand-50) 55%, var(--card)) 0%, var(--card) 22%, var(--card) 78%, color-mix(in srgb, var(--brand-50) 40%, var(--card)) 100%)";

export default async function StoryBankPage() {
  const session = await getSession();
  if (!session) redirect("/login?callbackUrl=%2Fprofile%2Fstories");
  const userId = (session.user as { id?: string }).id ?? null;
  const role = (session.user as { role?: string }).role ?? "trainee";
  if (!userId) redirect("/login?callbackUrl=%2Fprofile%2Fstories");

  const traineeRoles = ["trainee", "evaluating", "instructor", "admin", "superadmin"];
  if (!traineeRoles.includes(role)) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <h1 className="text-xl font-bold text-fg">Not for your role</h1>
          <p className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">
            The Story Bank is for trainees — a private library of STAR-format
            stories you&apos;ve authored during application prep.
          </p>
        </div>
      </div>
    );
  }

  const stories = await prisma.starStory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      skills: { include: { skill: { select: { id: true, name: true } } } },
      source: { select: { id: true, title: true, companyName: true } },
    },
  });

  const isStaff = checkIsStaff(role);

  return (
    <div>
      {/* Cinematic full-bleed hero replaces the previous custom
          rounded-3xl outer panel + inline title block. The inner
          hairline-divided sections (admin demo tray, stories list,
          help footer) live below in a max-w-4xl column. */}
      <PageHero
        eyebrow={<><BookOpen size={11} /> Profile · Story Bank</>}
        title="Your STAR stories"
        description={(
          <>
            STAR-format stories you&apos;ve drafted. Reusable across postings — a story tagged with &quot;cell culture&quot; works for any role that needs it. New stories land here when you click <em>Save to Story Bank</em> in the prep flow.
          </>
        )}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
      <div
        className="rounded-3xl border border-line overflow-hidden surface-shadow"
        style={{ background: OUTER_BG }}
      >
        {/* (Header section deleted — PageHero above carries the
            eyebrow / title / description. The story-list / admin-tray
            / help sections below still live in this rounded inner
            panel so they retain the hairline-divided layout.) */}
        <header className="hidden">
          <p>
            STAR-format stories you&apos;ve drafted. Reusable across postings — a story
            tagged with &quot;cell culture&quot; works for any role that needs it. New
            stories land here when you click <em>Save to Story Bank</em> in the
            prep flow.
          </p>
        </header>

        {/* ── ADMIN DEMO TRAY (staff only) ─────────────────────── */}
        {/* Tinted amber wash so the section reads as the admin-only
            chrome it is — distinct from the trainee-facing content
            below, without being its own card. */}
        {isStaff && (
          <section
            aria-label="Admin demo controls"
            className="px-6 sm:px-10 lg:px-14 py-7 border-b border-line"
            style={{
              background:
                "linear-gradient(180deg, rgba(245,158,11,0.05) 0%, rgba(245,158,11,0) 90%)",
            }}
          >
            <SectionEyebrow tone="amber">Admin · demo seed</SectionEyebrow>
            <div className="mt-4">
              <DemoSeedAndClearTray
                entity="user_star_story"
                noun="demo STAR stories"
                clearHelp="Delete StarStory rows on your user where the title starts with [demo]. Real stories you've authored are not touched."
              />
            </div>
          </section>
        )}

        {/* ── BUILDER ──────────────────────────────────────────── */}
        <section
          aria-label="Draft a new story"
          className="px-6 sm:px-10 lg:px-14 pt-8 sm:pt-10 pb-2"
        >
          <SectionEyebrow>Story builder · live coaching</SectionEyebrow>
          <div className="mt-4">
            <StoryBuilder />
          </div>
        </section>

        {/* ── CONTENT ──────────────────────────────────────────── */}
        <section
          aria-label="Stories"
          className="px-6 sm:px-10 lg:px-14 py-8 sm:py-10"
        >
          <SectionEyebrow>
            {stories.length === 0
              ? "Your bank"
              : `${stories.length} ${stories.length === 1 ? "story" : "stories"} on file`}
          </SectionEyebrow>
          <div className="mt-5">
            {stories.length === 0 ? (
              <div className="flex flex-col items-center text-center py-6 sm:py-10">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                  <Sparkles size={20} />
                </span>
                <p className="text-base font-semibold text-fg mt-3">No stories yet</p>
                <p className="text-sm text-muted mt-1.5 max-w-md leading-relaxed">
                  Use the Story builder above to draft your first one — or open a
                  posting&apos;s <strong>Prepare for this posting</strong> flow and
                  reach Step 4.
                </p>
                <Link
                  href="/internships"
                  className="inline-flex items-center gap-2 mt-6 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-bold hover:bg-brand-700"
                >
                  Browse internships <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <StoryBankClient
                initialStories={stories.map((s) => ({
                  id: s.id,
                  title: s.title,
                  situation: s.situation,
                  task: s.task,
                  action: s.action,
                  result: s.result,
                  tags: s.tags,
                  skills: s.skills.map((ss) => ({ id: ss.skill.id, name: ss.skill.name })),
                  source: s.source
                    ? { id: s.source.id, title: s.source.title, companyName: s.source.companyName }
                    : null,
                  updatedAt: s.updatedAt.toISOString(),
                }))}
              />
            )}
          </div>
        </section>

        {/* ── HELP / WHERE-DO-STORIES-COME-FROM ────────────────── */}
        <section
          aria-label="How to add more stories"
          className="px-6 sm:px-10 lg:px-14 py-7 border-t border-line"
          style={{
            background:
              "linear-gradient(0deg, color-mix(in srgb, var(--brand-50) 45%, transparent) 0%, transparent 95%)",
          }}
        >
          <SectionEyebrow>Add more stories</SectionEyebrow>
          <p className="mt-3 text-xs sm:text-sm text-muted leading-relaxed max-w-2xl inline-flex items-start gap-2">
            <Plus size={14} className="text-brand-600 shrink-0 mt-0.5" />
            <span>
              STAR stories live in the prep flow at{" "}
              <code className="font-mono bg-elevated px-1.5 py-0.5 rounded text-fg/90">
                /internships/[id]/prepare
              </code>{" "}
              → Step 4. Open a posting, scaffold a story for a skill, save it, and
              it&apos;ll appear here. Stories are private to you — no employer or
              admin sees the body.
            </span>
          </p>
        </section>
      </div>
      </div>
    </div>
  );
}

/** Small eyebrow marker used at the top of each section. Uppercase
 *  tracked text, tone carried by colour alone — same vocabulary the
 *  HR-overview sections use for visual rhyme across the platform. (An
 *  earlier version prefixed this with a gradient hairline; that was
 *  asked to be removed platform-wide — see the note on DSEyebrow.) */
function SectionEyebrow({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "amber";
}) {
  const textClass = tone === "amber" ? "text-amber-800" : "text-subtle";
  return (
    <p className={`text-[10px] uppercase tracking-[0.28em] font-bold ${textClass}`}>
      {children}
    </p>
  );
}
