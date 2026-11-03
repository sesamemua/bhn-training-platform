import { redirect } from "next/navigation";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { SymposiumLinkedin } from "@/components/admin/events/SymposiumLinkedin";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";

export const dynamic = "force-dynamic";
export default async function SymposiumLinkedinPage() {
  if (!await requireRole("admin").catch(() => null)) redirect(await deniedRedirect("/admin/workspace/symposium-2026/linkedin"));
  return <><FullWidthWhenCollapsed /><SymposiumLinkedin /></>;
}
