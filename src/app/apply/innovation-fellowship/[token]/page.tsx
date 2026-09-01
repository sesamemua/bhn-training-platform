import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { InnovationFellowshipForm } from "@/components/equip/InnovationFellowshipForm";
import { prisma } from "@/lib/prisma";
import type { EquipDocument, InnovationFellowshipFormData } from "@/lib/equip/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your EQUIP Innovation Fellowship application",
  robots: { index: false, follow: false },
};

export default async function InnovationFellowshipApplicationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 20) notFound();

  const application = await prisma.equipApplication.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      stream: true,
      status: true,
      formData: true,
      documents: true,
      submittedAt: true,
      applicantEmail: true,
    },
  });
  if (!application || application.stream !== "innovation_fellowship") notFound();

  if (application.status !== "draft") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-subtle">
          BioHubNet EQUIP
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg">Application received</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Thank you. We received your Innovation Fellowship application
          {application.submittedAt ? ` on ${application.submittedAt.toISOString().slice(0, 10)}` : ""}.
          A complete PDF copy has been sent to <strong className="text-fg">{application.applicantEmail}</strong>.
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Questions or corrections? Write to{" "}
          <a href="mailto:equip@biohubnet.ca" className="font-semibold text-brand-700 hover:underline">
            equip@biohubnet.ca
          </a>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <InnovationFellowshipForm
        applicationId={token}
        initial={(application.formData ?? {}) as InnovationFellowshipFormData}
        initialDocuments={(application.documents as unknown as EquipDocument[]) ?? []}
      />
    </main>
  );
}
