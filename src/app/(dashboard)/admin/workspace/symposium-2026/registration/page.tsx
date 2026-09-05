/**
 * Workspace → Training Week → Registration Form.
 *
 * The Training Week registration, on its own page.
 *
 * Not a link into Workspace → Process → Forms with the right one
 * pre-selected: which form that page opens is "whichever was edited
 * last", and a menu item that lands somewhere different depending on
 * what a colleague did this morning is not a menu item. It is also why
 * this is a separate ROUTE rather than a query string — the sidebar
 * decides what is highlighted from the pathname, so two entries sharing
 * one path would both light up.
 *
 * The general builder stays where it is. This page is the one form the
 * symposium runs on, reachable in one click from the group that owns it.
 */
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { FormsWorkspace } from "@/components/workspace/FormsWorkspace";
import { parseForm } from "@/lib/formbuilder/types";
import { REGISTRATION_FORM_SLUG } from "@/lib/allocation/symposium-2026";

export const dynamic = "force-dynamic";

export default async function SymposiumRegistrationPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const row = await prisma.eventForm.findUnique({
    where: { slug: REGISTRATION_FORM_SLUG },
    select: { id: true, slug: true, title: true, active: true, fields: true, updatedAt: true },
  });

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · Training Week"
        title="Registration Form"
        description="What people fill in to register for Training Week, and the workflow their answers run through."
        icon={<ClipboardList />}
      />
      {row ? (
        <FormsWorkspace
          only
          forms={[{
            id: row.id,
            slug: row.slug,
            title: row.title,
            active: row.active,
            doc: parseForm(row.fields),
            updatedAt: row.updatedAt.toISOString(),
          }]}
        />
      ) : (
        /*
         * Said plainly rather than rendered as an empty builder. A blank
         * form editor looks like a form with no questions, and the fix
         * for "it is not there" is a different thing entirely from the
         * fix for "it is there and empty".
         */
        <div className="mt-6 rounded-xl border-2 border-line-strong bg-card p-5">
          <p className="text-[13px] font-semibold text-fg">The registration form is not in the database yet.</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Nothing is looking for <code className="font-mono text-[11.5px]">{REGISTRATION_FORM_SLUG}</code>.
            Run <code className="font-mono text-[11.5px]">npx tsx scripts/seed-training-week-2026.ts</code> to
            create it, or build it under Process → Forms and give it that slug.
          </p>
        </div>
      )}
    </>
  );
}
