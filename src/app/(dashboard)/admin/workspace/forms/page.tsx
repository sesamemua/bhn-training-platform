/**
 * Workspace → Process → Forms.
 *
 * Build a form and the workflow its answers run through, side by side.
 * Separate from Flow Charts on purpose: a chart is a drawing of a
 * process for people to read, this is a specification something
 * executes, and tying them meant neither could change alone.
 */
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { FormsWorkspace } from "@/components/workspace/FormsWorkspace";
import { parseForm } from "@/lib/formbuilder/types";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const rows = await prisma.eventForm.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, active: true, fields: true, updatedAt: true },
  });

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · Process"
        title="Forms"
        description="Build a form — questions, logic, external data sheets — beside the workflow its answers run through."
        icon={<ClipboardList />}
      />
      <FormsWorkspace
        forms={rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          active: r.active,
          doc: parseForm(r.fields),
          updatedAt: r.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
