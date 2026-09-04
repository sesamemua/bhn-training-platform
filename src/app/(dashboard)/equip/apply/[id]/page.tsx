/**
 * /equip/apply/[id] — draft editor (or read-only viewer once
 * submitted).
 *
 * Routes by stream: VentureConnect → ConnectForm, VentureLift →
 * LiftForm (Phase B). Anything submitted lands on the read-only
 * SubmittedView with the comment thread.
 *
 * Identity pre-fill: server reads the user's profile fields and
 * passes them to the client form so day-1 friction is zero.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ArrowLeft } from "lucide-react";
import { ConnectForm } from "@/components/equip/ConnectForm";
import { SubmittedView } from "@/components/equip/SubmittedView";
import { LiftForm } from "@/components/equip/LiftForm";
import { LiftFullForm } from "@/components/equip/LiftFullForm";
import type {
  VentureConnectFormData,
  VentureLiftFormData,
  VentureLiftFullData,
  EquipDocument,
  EquipStatus,
  EquipStream,
  ApplicationStage,
} from "@/lib/equip/types";
import { isEditable, isInFullAppStage } from "@/lib/equip/types";
import { institutionLabel } from "@/lib/equip/institutions";

export const dynamic = "force-dynamic";

export default async function EquipApplicationDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const userId = (session.user as { id?: string }).id;
  if (!userId) redirect("/login");

  const app = await prisma.equipApplication.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, name: true, email: true,
          organization: true, jobTitle: true, country: true, phone: true,
        },
      },
    },
  });
  if (!app || app.userId !== userId) redirect("/equip");

  const status = app.status as EquipStatus;
  const stage  = app.applicationStage as ApplicationStage;

  // VL applicants whose pre-screening was approved auto-advance
  // into Stage 2. We flip applicationStage + status here so the
  // form switch below can rely on a single source of truth. (The
  // PATCH endpoint enforces isEditable, which allows
  // pre_screen_approved as editable — so this transition is
  // visible in the URL but doesn't unlock the form until the
  // user actually starts typing.)
  if (app.stream === "venture_lift" && status === "pre_screen_approved" && stage !== "full_app") {
    await prisma.equipApplication.update({
      where: { id: app.id },
      data: { applicationStage: "full_app" },
    });
    app.applicationStage = "full_app";
  }

  // Once submitted/under review/decided, the surface flips to
  // read-only with the comment thread surfaced. Pre-screen
  // approved is NOT terminal — the applicant still needs to fill
  // Stage 2 — so we let it through to the form switch below.
  if (!isEditable(status)) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Link
          href="/equip/my-applications"
          className="text-xs text-muted hover:text-fg inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> My applications
        </Link>
        <SubmittedView application={{ ...(JSON.parse(JSON.stringify(app))), userId }} />
      </div>
    );
  }

  // Institution pre-fill priority:
  //   1. Wizard's choice on this application (one of the 14
  //      partner slugs OR the "Other" free-text)
  //   2. User.organization captured at registration
  //   3. Blank, applicant types it
  const wizardInstitution = institutionLabel(app.institution, app.institutionOther);
  const resolvedOrganization =
    (wizardInstitution && wizardInstitution !== "—" ? wizardInstitution : null)
    ?? (app.user?.organization ?? null)
    ?? null;
  const role = ((session.user as { role?: string }).role ?? "trainee");
  const isAdmin = role === "admin" || role === "superadmin";

  // Editable — render the stream-specific form.
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link
        href="/equip"
        className="text-xs text-muted hover:text-fg inline-flex items-center gap-1"
      >
        <ArrowLeft size={12} /> Equip
      </Link>

      {app.stream === "venture_connect" ? (
        <ConnectForm
          applicationId={app.id}
          initial={(app.formData as VentureConnectFormData) ?? {}}
          initialDocuments={(app.documents as unknown as EquipDocument[]) ?? []}
          profile={{
            name: (app.user?.name ?? "") ?? "",
            email: (app.user?.email ?? ""),
            organization: resolvedOrganization,
            jobTitle: (app.user?.jobTitle ?? null) ?? null,
          }}
          isAdmin={isAdmin}
          infoRequestedNote={status === "info_requested" ? app.reviewerNote : null}
        />
      ) : isInFullAppStage(app.stream as EquipStream, app.applicationStage as ApplicationStage, status) ? (
        <LiftFullForm
          applicationId={app.id}
          initial={(app.formData as VentureLiftFullData) ?? {}}
          initialDocuments={(app.documents as unknown as EquipDocument[]) ?? []}
          profile={{
            name: (app.user?.name ?? "") ?? "",
            email: (app.user?.email ?? ""),
            organization: resolvedOrganization,
            jobTitle: (app.user?.jobTitle ?? null) ?? null,
          }}
          isAdmin={isAdmin}
        />
      ) : (
        <LiftForm
          applicationId={app.id}
          initial={(app.formData as VentureLiftFormData) ?? {}}
          initialDocuments={(app.documents as unknown as EquipDocument[]) ?? []}
          profile={{
            name: (app.user?.name ?? "") ?? "",
            email: (app.user?.email ?? ""),
            organization: resolvedOrganization,
            jobTitle: (app.user?.jobTitle ?? null) ?? null,
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
