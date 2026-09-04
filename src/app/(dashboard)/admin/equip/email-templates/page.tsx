/**
 * Admin → EQUIP → Email templates. Gallery + EDITOR for every applicant
 * email across the application lifecycle, rendered for both streams with
 * realistic sample data. Reviewers can view; admins can edit the copy
 * (manually or with AI assist) — overrides persist and live sends use them.
 */
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { requireCommitteeOrAdmin } from "@/lib/committees/membership";
import { DSPageHeader } from "@/components/design-system/DSPageHeader";
import { EquipEmailGallery, type StreamPreview } from "@/components/admin/equip/EquipEmailGallery";
import { CustomEquipTemplates, type CustomTemplateItem } from "@/components/admin/equip/CustomEquipTemplates";
import { EquipCopyRecipients } from "@/components/admin/equip/EquipCopyRecipients";
import {
  EQUIP_EMAIL_TEMPLATES,
  PLACEHOLDER_DOCS,
  getEquipTemplateOverrides,
  resolveTemplateFields,
  renderEquipEmail,
  renderCustomEquipEmail,
  listCustomEquipTemplates,
  getEquipCopyRecipients,
  sampleEquipCtx,
} from "@/lib/equip/emails";
import { STREAM_META } from "@/lib/equip/types";

export const dynamic = "force-dynamic";

const STREAMS = ["venture_connect", "venture_lift"] as const;

export default async function EquipEmailTemplatesPage() {
  const session = await requireCommitteeOrAdmin(["equip_review"], ["equip_grant_reviewer"]).catch(() => null);
  if (!session) redirect("/dashboard");
  const role = (session.user as { role?: string }).role ?? "";
  const canEdit = role === "admin" || role === "superadmin";

  const overrides = await getEquipTemplateOverrides();

  const streams: StreamPreview[] = STREAMS.map((stream) => {
    const ctx = sampleEquipCtx(stream);
    const items = EQUIP_EMAIL_TEMPLATES.filter(
      (t) => t.appliesTo === "both" || t.appliesTo === stream,
    ).map((t) => {
      const { fields, isCustomized } = resolveTemplateFields(t.id, stream, overrides);
      const built = renderEquipEmail(t.id, ctx, fields);
      return {
        id: t.id,
        label: t.label,
        when: t.when,
        subject: built.subject,
        html: built.html,
        fields,
        isCustomized,
      };
    });
    return { key: stream, name: STREAM_META[stream].name, items };
  });

  const customTemplates = await listCustomEquipTemplates();
  const customPreviews: CustomTemplateItem[] = customTemplates.map((t) => {
    const previewStream = t.appliesTo === "both" ? "venture_connect" : t.appliesTo;
    const built = renderCustomEquipEmail(sampleEquipCtx(previewStream), t);
    return { ...t, subject: built.subject, html: built.html };
  });

  const copyRecipients = await getEquipCopyRecipients();

  return (
    <div className="space-y-6">
      <DSPageHeader
        eyebrow={<><Mail size={11} /> Admin · EQUIP</>}
        title="Email templates"
        description={
          canEdit
            ? "Every email an applicant receives across the EQUIP lifecycle, for both VentureConnect and VentureLift. Previews use sample data; live emails fill in each applicant's real name, amounts, and reviewer notes. Edit any template — by hand or with AI rewrite — and your copy takes effect on the next send."
            : "Every email an applicant receives across the EQUIP lifecycle, for both VentureConnect and VentureLift. Previews use sample data; live emails fill in each applicant's real name, amounts, and reviewer notes. Template editing is reserved for platform admins."
        }
      />
      <EquipEmailGallery streams={streams} placeholders={PLACEHOLDER_DOCS} canEdit={canEdit} />

      <div className="border-t border-line pt-6">
        <CustomEquipTemplates initial={customPreviews} placeholders={PLACEHOLDER_DOCS} canEdit={canEdit} />
      </div>

      <div className="border-t border-line pt-6">
        <EquipCopyRecipients initial={copyRecipients} canEdit={canEdit} />
      </div>
    </div>
  );
}
