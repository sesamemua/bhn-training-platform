import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkshopSignInSheet } from "@/components/training-week/WorkshopSignInSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workshop sign-in sheet | BioHubNet", robots: { index: false, follow: false } };

export default async function WorkshopSignInPage({ params }: { params: Promise<{ id: string }> }) {
  if (!await requireRole("admin").catch(() => null)) redirect("/login");
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const workshop = await prisma.workshop.findUnique({
    where: { id },
    select: {
      title: true, startDateTime: true, endDateTime: true, locationName: true,
      bookings: {
        where: { status: "confirmed", withdrawnAt: null },
        select: {
          status: true, withdrawnAt: true,
          submission: { select: { data: true } },
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!workshop) notFound();
  return <WorkshopSignInSheet workshop={workshop} />;
}
