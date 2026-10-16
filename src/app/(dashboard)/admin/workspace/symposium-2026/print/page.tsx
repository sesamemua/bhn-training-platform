import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { SymposiumPrintJobs } from "@/components/admin/events/SymposiumPrintJobs";

export const dynamic = "force-dynamic";
export default async function SymposiumPrintPage() {
  if (!await requireRole("admin").catch(() => null)) redirect(await deniedRedirect("/admin/workspace/symposium-2026/print"));
  return <><FullWidthWhenCollapsed /><PageHero eyebrow={<><Printer size={12} /> 2026 Symposium</>} title="Print Jobs" /><SymposiumPrintJobs /></>;
}
