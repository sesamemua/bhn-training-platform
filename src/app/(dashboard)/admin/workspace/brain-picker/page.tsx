/**
 * Workspace → Brain Picker.
 *
 * A page for asking colleagues to look at things, which is honest about
 * what that is. It lists the team, what each of them is worth
 * interrupting for, and — above all of it — a running account of how
 * many favours the person reading has asked for against how many they
 * have returned.
 *
 * The joke is aimed at the asker, deliberately and without exception.
 * Everyone listed here is a real colleague who can open this page; the
 * moment it starts scoring THEM it becomes a page nobody wants to be on.
 *
 * The rules and the copy live in src/lib/brain/*.ts so they are testable
 * and so the numbers on screen cannot drift from the numbers asserted.
 */
import { redirect } from "next/navigation";
import { Brain } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { BrainPicker } from "@/components/workspace/BrainPicker";
import { NOTHING } from "@/lib/brain/picker";
import { TEAM_ROLES, buildTeam, type PickRow, type ProfileRow, type UserRow } from "@/lib/brain/team";

export const dynamic = "force-dynamic";

export default async function BrainPickerPage() {
  const session = await requireRole("admin").catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) redirect("/dashboard");

  const [users, profiles, picks, merchStars] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, accountKind: "real", role: { in: [...TEAM_ROLES] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => []),
    prisma.brainProfile.findMany({ select: { userId: true, speciality: true, rate: true } }).catch(() => []),
    prisma.brainPick.findMany({
      where: { OR: [{ askedById: userId }, { askedOfId: userId }] },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
    // Evidence for the "merch-starred" probe: what somebody actually did,
    // as opposed to what they said they would do.
    prisma.merchPick.groupBy({ by: ["userId"], _count: { _all: true } }).catch(() => []),
  ]);

  const team = buildTeam(users as UserRow[], profiles as ProfileRow[], picks as PickRow[], userId);
  const evidence: Record<string, number> = {};
  for (const row of merchStars) evidence[row.userId] = row._count._all;

  return (
    <div className="space-y-6">
      <DSPageHeader
        eyebrow="Workspace"
        title="Brain Picker"
        icon={<Brain size={22} />}
        description={
          "“Brain picker” is occasionally used to describe someone who frequently asks for free advice, " +
          "ideas, or informal consulting without offering to compensate you or provide anything of value in return. " +
          "This is a tool for doing that on purpose, with a receipt."
        }
      />
      <BrainPicker
        team={team}
        picks={JSON.parse(JSON.stringify(picks)) as PickRow[]}
        viewerId={userId}
        evidence={evidence}
        nothing={NOTHING}
      />
    </div>
  );
}
