/**
 * Admin → Email signature.
 *
 * The one block of text every email the platform sends ends with. Here
 * rather than in Settings because Settings is superadmin-only and takes
 * one line per value; this is several lines, anybody who sends letters
 * may need to change it, and it deserves a preview of what recipients
 * will actually see.
 */
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { SignatureEditor } from "@/components/admin/email-signature/SignatureEditor";
import { cleanSignature, DEFAULT_SIGNATURE, SIGNATURE_KEY } from "@/lib/mail-signature";

export const dynamic = "force-dynamic";

export default async function EmailSignaturePage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  const row = await prisma.platformSetting.findUnique({ where: { key: SIGNATURE_KEY } });
  const current = (row?.value && cleanSignature(row.value)) || DEFAULT_SIGNATURE;

  return (
    <div className="space-y-6">
      <DSPageHeader
        eyebrow={<><Mail size={11} /> Admin · Email</>}
        title="Email signature"
        description="Every email the platform sends ends with this — registration letters, seat decisions, EQUIP updates, the travel letter. Edit it once here and it changes everywhere. Mail the platform sends to the team itself, like backups, goes without it."
      />
      <SignatureEditor initial={current} original={DEFAULT_SIGNATURE} />
    </div>
  );
}
