/** Workspace → Outreach → Tracked links. UTM builder + /go short links with click counts. */
import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/ui/PageHero";
import { OutreachNav } from "@/components/workspace/OutreachNav";
import { LinksClient } from "@/components/workspace/crm/LinksClient";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");
  const links = await prisma.outreachLink.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={<><Link2 size={11} /> Workspace · Marketing</>}
        title="Tracked links"
        description="Tag a link with UTM source, medium and campaign so sign-ups can be traced back to where people found it, and get a short /go link that counts clicks."
      />
      <OutreachNav />
      <LinksClient
        origin={process.env.NEXTAUTH_URL ?? "https://bhn-training-platform.vercel.app"}
        initial={links.map((l) => ({ ...l, lastAt: l.lastAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString() }))}
      />
    </div>
  );
}
