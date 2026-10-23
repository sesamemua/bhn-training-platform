import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkshopSignInSheet } from "@/components/training-week/WorkshopSignInSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workshop sign-in sheet | BioHubNet", robots: { index: false, follow: false } };

export default async function WorkshopSignInPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sort?: string | string[] }> }) {
  if (!await requireRole("admin").catch(() => null)) redirect("/login");
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  const workshop = await prisma.workshop.findUnique({
    where: { id },
    select: {
      title: true, startDateTime: true, endDateTime: true, locationName: true,
      bookings: {
        where: { status: "confirmed", withdrawnAt: null },
        orderBy: { bookedAt: "desc" },
        select: {
          id: true, submissionId: true, userId: true,
          status: true, withdrawnAt: true,
          submission: { select: { data: true, email: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!workshop) notFound();
  const sortBy = (await searchParams).sort === "last" ? "last" : "first";
  return <WorkshopSignInSheet workshop={workshop} sortBy={sortBy} />;
}
