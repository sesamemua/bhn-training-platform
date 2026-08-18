/**
 * The admin panel as its own window.
 *
 * Deliberately outside the (dashboard) group: this opens as a popup beside
 * the editor, and a sidebar, hero and page chrome would be most of the
 * window. Auth is still enforced here — being a popup is not a way in.
 */
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { FlowAdminPanelWindow } from "@/components/workspace/FlowAdminPanelWindow";

export const dynamic = "force-dynamic";

export default async function FlowChartPanelPage() {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) redirect("/login?next=/flowchart-panel");
  const role = (session.user as { role?: string }).role ?? "user";
  const canEdit = role === "admin" || role === "superadmin";
  return <FlowAdminPanelWindow canEdit={canEdit} />;
}
