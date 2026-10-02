/**
 * /showcase/[slug] — PUBLIC, no-login graduate-showcase submission page
 * for any admin-created ShowcaseGroup. Mirrors the hand-built
 * /showcase/regulatory-affairs page, but pulls the eyebrow / title /
 * intro from the group row so each group has its own branded link.
 *
 * The original /showcase/regulatory-affairs stays its own static route
 * (static segments win over [slug]), so it's untouched; newly-created
 * groups land here. Lives outside the (dashboard) group — no shell, no
 * auth gate. Pinned to data-theme="light" so the public intake form is
 * brand-consistent regardless of the visitor's theme.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ShowcaseSubmitForm } from "@/components/showcase/ShowcaseSubmitForm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

function getGroup(slug: string) {
  return prisma.showcaseGroup.findUnique({
    where: { slug },
    include: {
      pathway: true,
      linkedCohort: { select: { id: true, name: true, pathwayId: true } },
    },
  });
}

const DEFAULT_INTRO =
  "Done the pathway? Drop your name, LinkedIn handle, and a headshot, and we'll feature you alongside the other graduates. No login needed.";

/** Public branding: a cohort inherits its pathway's eyebrow + intro (with
 *  a constant "Graduate Showcase" title); a standalone group uses its own. */
function branding(group: {
  name: string;
  eyebrow: string | null;
  intro: string | null;
  pathway: { name: string; eyebrow: string | null; intro: string | null } | null;
}) {
  if (group.pathway) {
    return {
      eyebrow: group.pathway.eyebrow || group.pathway.name,
      title: "Graduate Showcase",
      intro: group.pathway.intro || DEFAULT_INTRO,
    };
  }
  return { eyebrow: group.eyebrow, title: group.name, intro: group.intro };
}

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const group = await getGroup(slug);
  if (!group) return { title: "Showcase · BioHubNet", robots: { index: false } };
  const b = branding(group);
  return {
    title: `${b.title} · BioHubNet`,
    description:
      b.intro ??
      "Submit your name, LinkedIn handle, and a headshot to be featured in the BioHubNet showcase.",
    robots: { index: false, follow: false },
  };
}

export default async function ShowcaseGroupPage({ params }: Ctx) {
  const { slug } = await params;
  const group = await getGroup(slug);
  if (!group) notFound();
  const b = branding(group);
  const ask = group.quotePrompt ? { prompt: group.quotePrompt, maxWords: group.quoteMaxWords } : null;

  // Attendance gate: a bound + gated cohort requires login and only lets
  // approved-enrolled + attended trainees submit (re-checked server-side in
  // /api/showcase/submit, which is the real enforcement boundary).
  const gated = group.gateOnAttendance && !!group.linkedCohortId;
  let gateState: "open" | "signin" | "not-enrolled" | "not-attended" | "eligible" =
    "open";
  let lockedName = "";
  if (gated) {
    const session = await getSession();
    if (!session) {
      gateState = "signin";
    } else {
      const userId = (session.user as { id?: string }).id ?? "";
      lockedName = (session.user as { name?: string }).name ?? "";
      const enr = await prisma.pathwayEnrollment.findFirst({
        where: {
          userId,
          cohortId: group.linkedCohortId!,
          status: { in: ["approved", "completed"] },
        },
        select: { attended: true },
      });
      if (!enr) gateState = "not-enrolled";
      else if (!enr.attended) gateState = "not-attended";
      else gateState = "eligible";
    }
  }

  return (
    <main
      data-theme="light"
      className="min-h-screen bg-gradient-to-b from-[#f0f7f7] via-[#e6f0f1] to-[#dfecee]"
    >
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <header className="flex flex-col items-center text-center mb-10 sm:mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/biohubnet-logo.png"
            alt="BioHubNet — Transformative Talent Development"
            className="w-full max-w-md h-auto"
          />
        </header>

        <section className="mb-7 text-center">
          {b.eyebrow && (
            <p
              className="text-[10.5px] uppercase tracking-[0.22em] font-bold"
              style={{ color: "#0b6f90" }}
            >
              {b.eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-[24px] sm:text-[30px] font-bold text-fg leading-tight">
            {b.title}
          </h2>
          {b.intro && (
            <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed text-fg-muted max-w-md mx-auto">
              {b.intro}
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white shadow-card-rest border border-line/70 px-5 sm:px-7 py-5 sm:py-7">
          {!group.active ? (
            <div className="text-center py-6">
              <h3 className="text-[16px] font-semibold text-fg">
                Submissions are closed
              </h3>
              <p className="mt-2 text-[13px] text-fg-muted">
                This showcase isn&apos;t accepting new entries right now. Check
                back later, or reach out to the BioHubNet team.
              </p>
            </div>
          ) : gated ? (
            gateState === "eligible" ? (
              <ShowcaseSubmitForm
                programSlug={group.slug}
                gated
                lockedName={lockedName}
                quote={ask}
                photoLabel={group.photoLabel}
                consentText={group.consentText}
              />
            ) : (
              <GateNotice
                state={gateState as "signin" | "not-enrolled" | "not-attended"}
                slug={slug}
                cohortName={group.linkedCohort?.name}
              />
            )
          ) : (
            <ShowcaseSubmitForm programSlug={group.slug} quote={ask} photoLabel={group.photoLabel} consentText={group.consentText} />
          )}
        </section>

        {/* Not on an awardee intake (a link that asks a written question): one submission each. */}
        {!group.quotePrompt && (
        <footer className="mt-10 text-center text-[12px] text-fg-muted">
          <p>
            Already submitted? You can resubmit any time — we&apos;ll triage
            duplicates on our side.
          </p>
          <p className="mt-2">Questions? Reach out to the BioHubNet team.</p>
        </footer>
        )}
      </div>
    </main>
  );
}

/** Shown in place of the form when a cohort is attendance-gated and the
 *  visitor isn't (yet) an eligible, attended, signed-in trainee. */
function GateNotice({
  state,
  slug,
  cohortName,
}: {
  state: "signin" | "not-enrolled" | "not-attended";
  slug: string;
  cohortName?: string | null;
}) {
  const cohort = cohortName ? ` (${cohortName})` : "";
  if (state === "signin") {
    return (
      <div className="text-center py-6">
        <h3 className="text-[16px] font-semibold text-fg">Sign in to submit</h3>
        <p className="mt-2 text-[13px] text-fg-muted max-w-sm mx-auto">
          This showcase is for trainees who registered for and attended the
          pathway{cohort}. Sign in with your BioHubNet account to continue.
        </p>
        <a
          href={`/login?callbackUrl=${encodeURIComponent(`/showcase/${slug}`)}`}
          className="mt-4 inline-block rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(90deg, #2a6d7a 0%, #0e7da3 100%)" }}
        >
          Sign in &rarr;
        </a>
      </div>
    );
  }
  if (state === "not-enrolled") {
    return (
      <div className="text-center py-6">
        <h3 className="text-[16px] font-semibold text-fg">
          Not on this cohort&apos;s roster
        </h3>
        <p className="mt-2 text-[13px] text-fg-muted max-w-sm mx-auto">
          We couldn&apos;t find an approved registration for you in this pathway
          cohort{cohort}. If you think this is a mistake, reach out to the
          BioHubNet team.
        </p>
      </div>
    );
  }
  return (
    <div className="text-center py-6">
      <h3 className="text-[16px] font-semibold text-fg">
        Attendance not recorded yet
      </h3>
      <p className="mt-2 text-[13px] text-fg-muted max-w-sm mx-auto">
        You&apos;re registered for this cohort{cohort}, but our records
        don&apos;t show you as having attended yet — only attendees can be
        featured. If you did attend, the team will update your attendance
        shortly.
      </p>
    </div>
  );
}
