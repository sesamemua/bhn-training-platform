/**
 * A shared collection: view-only, no sign-in, until its link expires.
 * Only the pictures and their credits are shown — never rights notes,
 * people's names or where the pictures are used.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assets/usage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared pictures · BioHubNet", robots: { index: false, follow: false } };

export default async function SharedCollection({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) notFound();
  const c = await prisma.assetCollection.findUnique({ where: { shareToken: token } });
  if (!c || !c.shareExpiresAt || c.shareExpiresAt <= new Date()) notFound();
  const assets = await prisma.asset.findMany({
    where: { id: { in: c.assetIds }, deletedAt: null, key: { not: "" }, consent: { not: "refused" } },
    select: { id: true, title: true, key: true, thumbKey: true, altText: true, credit: true, width: true, height: true, color: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-700">BioHubNet · shared pictures</p>
      <h1 className="mt-1 text-[28px] font-bold text-fg">{c.name}</h1>
      <p className="mt-1 text-sm text-muted">{assets.length} pictures · view and download until {c.shareExpiresAt.toLocaleDateString("en-CA")}</p>
      <div className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4">
        {assets.map((a) => (
          <figure key={a.id} className="mb-3 break-inside-avoid overflow-hidden rounded-[12px] border border-line bg-card-solid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(a.thumbKey) ?? assetUrl(a.key)!} alt={a.altText ?? a.title} loading="lazy" width={a.width ?? undefined} height={a.height ?? undefined}
              className="block h-auto w-full" style={{ backgroundColor: a.color ?? undefined }} />
            <figcaption className="flex items-center gap-2 px-2.5 py-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate font-semibold text-fg">{a.title}{a.credit ? <span className="font-normal text-muted"> · © {a.credit}</span> : null}</span>
              <a href={assetUrl(a.key)!} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-brand-700 hover:underline">Download</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
