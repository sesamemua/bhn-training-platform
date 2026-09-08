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
import { isEditable, type EquipDocument, type EquipStatus, type VentureConnectFormData } from "@/lib/equip/types";

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
      applicantName: true, applicantEmail: true, reviewerNote: true,
    },
  });
  if (!app || app.stream !== "venture_connect") notFound();

  if (!isEditable(app.status as EquipStatus)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Application Received</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          Thank you. We have received your VentureConnect application
          {app.submittedAt ? ` dated ${formatSubmittedDate(app.submittedAt)}` : ""}.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          A copy of materials submitted with your application is attached to the confirmation
          email that will be sent shortly.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          The review process may take up to 10 business days. The BioHubNet EQUIP team will
          contact you following the review of your application.
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
        infoRequestedNote={app.status === "info_requested" ? app.reviewerNote : null}
      />
    </main>
  );
}

/**
 * "September 8, 2026" — the date an applicant would write, not the one a
 * database would.
 *
 * Pinned to America/Toronto for the same reason the PDF packet's
 * formatter is: the server renders this in UTC, so a submission made at
 * 9pm Toronto time would otherwise be dated the following day on screen
 * while the attached packet said the day before. One timezone, one date.
 */
function formatSubmittedDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(value);
}
