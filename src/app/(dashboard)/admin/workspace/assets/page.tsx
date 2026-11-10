/**
 * Workspace → Assets. The team's picture library: every upload, tagged
 * and captioned, with rights, sizes, collections and where each is used.
 */
import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { AssetLibrary } from "@/components/workspace/assets/AssetLibrary";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  if (!await requireRole("superadmin").catch(() => null)) redirect("/dashboard");
  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace"
        title="Assets"
        description="Every picture the team uses, in one place. Drop or paste pictures anywhere on this page; they're captioned and tagged automatically, so you can search by what's in them."
        icon={<Images />}
      />
      <div className="mt-6"><AssetLibrary /></div>
    </>
  );
}
