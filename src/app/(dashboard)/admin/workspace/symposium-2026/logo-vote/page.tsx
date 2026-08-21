/**
 * Workspace → 2026 Symposium → Logo Vote.
 *
 * Sixty candidate icons for the Luma registration page, and a way for
 * the team to say which three they would use.
 */
import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { LogoVote } from "@/components/workspace/LogoVote";
import { LOGO_OPTIONS, VOTES_PER_PERSON } from "@/lib/symposium/logo-options";

export const dynamic = "force-dynamic";

export default async function LogoVotePage() {
  // Instructors too, not admins only: this is a house opinion, and a
  // poll only three people can answer tells you about three people.
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect("/dashboard");

  return (
    <>
      <FullWidthWhenCollapsed />
      <PageHero
        eyebrow="Workspace · 2026 Symposium"
        title="Logo Vote"
        description={`${LOGO_OPTIONS.length} candidate icons for the Symposium's Luma registration page. Everyone gets ${VOTES_PER_PERSON} picks.`}
        icon={<Images />}
      />
      <LogoVote />
    </>
  );
}
