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
import { versionNumber, versionRoot } from "@/lib/formbuilder/versions";
import {
  REGISTRATION_FORM_SLUG, REGISTRATION_FORM_SLUG_V2, REGISTRATION_FORM_WHERE,
} from "@/lib/allocation/symposium-2026";

export const dynamic = "force-dynamic";

export default async function SymposiumRegistrationPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  // Every version, by version root — the same rule the registrant sheet
  // pools by, so a v3 made with Duplicate is here as well as there.
  const found = (await prisma.eventForm.findMany({
    where: REGISTRATION_FORM_WHERE,
    select: { id: true, slug: true, title: true, active: true, fields: true, updatedAt: true },
  })).filter((f) => versionRoot(f.slug) === REGISTRATION_FORM_SLUG);
  // Newest version first. The builder opens on the first form it is
  // handed, and the newest is the one being given out — v1 stays live,
  // exactly as the people already registered on it saw it, and is not
  // the one to edit.
  const rows = [...found].sort((a, b) => versionNumber(b.slug) - versionNumber(a.slug));

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · Training Week"
        title="Registration Form"
        description="What people fill in to register for Training Week, and the workflow their answers run through."
        icon={<ClipboardList />}
      />
      {rows.length > 0 ? (
        <FormsWorkspace
          only
          forms={rows.map((row) => ({
            id: row.id,
            slug: row.slug,
            title: row.title,
            active: row.active,
            doc: parseForm(row.fields),
            updatedAt: row.updatedAt.toISOString(),
          }))}
        />
      ) : (
        /*
         * Said plainly rather than rendered as an empty builder. A blank
         * form editor looks like a form with no questions, and the fix
         * for "it is not there" is a different thing entirely from the
         * fix for "it is there and empty".
         */
        <div className="mt-6 rounded-xl border-2 border-line-strong bg-card p-5">
          <p className="text-[13px] font-semibold text-fg">Neither Training Week registration form is in the database yet.</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Nothing is looking for <code className="font-mono text-[11.5px]">{REGISTRATION_FORM_SLUG_V2}</code> or{" "}
            <code className="font-mono text-[11.5px]">{REGISTRATION_FORM_SLUG}</code>. v2 is built from v1, so v1 comes
            first: run <code className="font-mono text-[11.5px]">npx tsx scripts/seed-training-week-2026.ts</code> to
            create it, then <code className="font-mono text-[11.5px]">npx tsx scripts/create-training-week-v2.ts</code> to
            see what v2 would be, and add <code className="font-mono text-[11.5px]">--apply</code> to create it.
          </p>
        </div>
      )}
    </>
  );
}
