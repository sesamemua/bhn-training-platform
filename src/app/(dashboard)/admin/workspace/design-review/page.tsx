/**
 * Workspace → Design Review.
 *
 * Three levels on one address: every project; one project's artworks
 * (?p=); one artwork, open for comments (?a=). Staff only.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Palette } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { DesignArtworkBar, DesignProjectList, DesignProjectView } from "@/components/workspace/DesignReviewBoard";
import { DesignArtworkView } from "@/components/workspace/DesignArtworkView";
import { isApproval, isReviewer, isWide, pagesOf, reviewerStates, type Approval } from "@/lib/design-review/types";

export const dynamic = "force-dynamic";

const BASE = "/admin/workspace/design-review";
const approvalOf = (v: string): Approval => (isApproval(v) ? v : "pending");

export default async function DesignReviewPage({ searchParams }: { searchParams: Promise<{ p?: string; a?: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect("/dashboard");
  const u = session.user as { id?: string; name?: string | null; email?: string | null; role?: string };
  const me = { id: u.id ?? "", name: u.name || u.email || "Team member", admin: u.role === "admin" || u.role === "superadmin" };
  const { p, a } = await searchParams;

  // The team whose review counts: staff accounts, without the demo ones.
  const staffRows = await prisma.user.findMany({
    where: { role: { in: ["instructor", "admin", "superadmin"] }, NOT: [{ email: { contains: "demo" } }, { email: { endsWith: ".test" } }] },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const staff = staffRows.map((s) => ({ id: s.id, name: s.name || s.email || "Team member" }));
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? null;
  // Who reviews: the staff, less anyone not on the review team. (Approver pickers still offer everyone.)
  const reviewers = staff.filter((s) => isReviewer(s.name));

  const hero = (
    <>
      <PageHero
        eyebrow={<><Palette size={11} /> Workspace</>}
        title="Design Review"
        description="Put a comment anywhere on a design — a one-pager, a banner, a slide — and ask a teammate to look. Each artwork shows who has looked, who is OK with it, and whether it is approved. When a round is done, copy its feedback for whoever makes the changes; the round locks until you start the next."
      />
    </>
  );
  const back = (href: string, label: string) => (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg"><ArrowLeft size={13} /> {label}</Link>
  );

  if (a) {
    const art = await prisma.designArtwork.findUnique({
      where: { id: a },
      include: { project: { select: { id: true, name: true, approverId: true } }, pins: { orderBy: { createdAt: "asc" } }, reviews: true },
    });
    if (!art) redirect(BASE);
    const approverName = nameOf(art.project.approverId);
    return (
      <div className="space-y-4">
        {hero}
        {back(`${BASE}?p=${art.project.id}`, art.project.name)}
        <DesignArtworkBar artwork={{ id: art.id, title: art.title, description: art.description, sourceName: art.sourceName, empty: pagesOf(art.pages).length === 0 }} projectId={art.project.id} />
        {pagesOf(art.pages).length === 0 && (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-[13px] text-muted">
            This is a placeholder — nothing has been uploaded yet. Press <strong className="text-fg">Upload the artwork</strong> above when the design is ready, and it opens for comments.
          </p>
        )}
        {pagesOf(art.pages).length > 0 && (
        <DesignArtworkView
          me={me}
          approver={art.project.approverId && approverName ? { id: art.project.approverId, name: approverName } : null}
          artwork={{
            id: art.id, title: art.title, description: art.description, pages: pagesOf(art.pages),
            approval: approvalOf(art.approval), approvalNote: art.approvalNote, approvalAt: art.approvalAt?.toISOString() ?? null,
            round: art.round, locked: !!art.lockedAt, project: art.project.name,
            pins: art.pins.map((n) => ({ round: n.round, id: n.id, page: n.page, x: n.x, y: n.y, parentId: n.parentId, authorId: n.authorId, authorName: n.authorName, body: n.body, status: n.status, createdAt: n.createdAt.toISOString() })),
            reviewers: reviewerStates(reviewers, art.reviews),
          }}
        />
        )}
      </div>
    );
  }

  if (p) {
    const project = await prisma.designProject.findUnique({
      where: { id: p },
      include: { artworks: { orderBy: { order: "asc" }, include: { reviews: true, pins: { where: { parentId: null, status: "open" }, select: { id: true } } } } },
    });
    if (!project) redirect(BASE);
    return (
      <div className="space-y-4">
        {hero}
        {back(BASE, "All projects")}
        <DesignProjectView
          staff={staff}
          project={{ id: project.id, name: project.name, description: project.description, approverId: project.approverId, approverName: nameOf(project.approverId) }}
          artworks={project.artworks.map((w) => {
            const pages = pagesOf(w.pages);
            return {
              id: w.id, title: w.title, description: w.description, thumb: pages[0]?.url ?? null, pages: pages.length, wide: isWide(pages[0]),
              approval: approvalOf(w.approval), openComments: w.pins.length, round: w.round, locked: !!w.lockedAt, reviewers: reviewerStates(reviewers, w.reviews),
            };
          })}
        />
      </div>
    );
  }

  const projects = await prisma.designProject.findMany({
    orderBy: { createdAt: "desc" },
    include: { artworks: { orderBy: { order: "asc" }, select: { pages: true, approval: true, _count: { select: { pins: { where: { parentId: null, status: "open" } } } } } } },
  });
  return (
    <div className="space-y-4">
      {hero}
      <DesignProjectList
        staff={staff}
        defaultApproverId={staff.find((s) => /^yoo\s*jin/i.test(s.name))?.id ?? null}
        projects={projects.map((pr) => ({
          id: pr.id, name: pr.name, description: pr.description, approverName: nameOf(pr.approverId),
          artworks: pr.artworks.length,
          approved: pr.artworks.filter((w) => w.approval === "approved").length,
          openComments: pr.artworks.reduce((n, w) => n + w._count.pins, 0),
          cover: pagesOf(pr.artworks[0]?.pages)[0]?.url ?? null,
        }))}
      />
    </div>
  );
}
