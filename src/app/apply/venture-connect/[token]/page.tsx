/**
 * A public VentureConnect application, opened by its own link.
 *
 * The token IS the authorisation — 192 bits, one application, and the
 * only way in, because there is no account to check against. That is
 * the whole point of this route, and it is why the link is worth
 * treating like a password in the copy below.
 *
 * The form itself is the same component the signed-in flow uses,
 * pointed at the public endpoints. Same questions, same validator.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ConnectForm } from "@/components/equip/ConnectForm";
import type { EquipDocument, VentureConnectFormData } from "@/lib/equip/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your VentureConnect application",
  robots: { index: false, follow: false },
};

export default async function PublicVentureConnectFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 20) notFound();

  const app = await prisma.equipApplication.findUnique({
    where: { publicToken: token },
    select: {
      id: true, stream: true, status: true, formData: true, documents: true, submittedAt: true,
      applicantName: true, applicantEmail: true,
    },
  });
  if (!app || app.stream !== "venture_connect") notFound();

  if (app.status !== "draft") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Application received</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Thank you — we have your VentureConnect application
          {app.submittedAt ? ` from ${app.submittedAt.toISOString().slice(0, 10)}` : ""}. The
          EQUIP team will be in touch at{" "}
          <strong className="text-fg">{app.applicantEmail}</strong>. If anything needs
          changing, write to{" "}
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
      <ConnectForm
        applicationId={token}
        initial={(app.formData ?? {}) as VentureConnectFormData}
        initialDocuments={(app.documents as unknown as EquipDocument[]) ?? []}
        endpointBase="/api/public/equip"
        profile={{
          name: app.applicantName ?? "",
          email: app.applicantEmail ?? "",
          organization: null,
          jobTitle: null,
        }}
      />
    </main>
  );
}
