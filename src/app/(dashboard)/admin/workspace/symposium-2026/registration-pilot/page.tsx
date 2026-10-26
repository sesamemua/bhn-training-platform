import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireRole, deniedRedirect } from "@/lib/auth";
import { PageHero } from "@/components/ui/PageHero";
import { FullWidthWhenCollapsed } from "@/components/workspace/FullWidthWhenCollapsed";
import { SymposiumRegistrationPilot } from "@/components/admin/events/SymposiumRegistrationPilot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Symposium registration pilot", robots: { index: false, follow: false } };

export default async function SymposiumRegistrationPilotPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!await requireRole("admin").catch(() => null)) {
    redirect(await deniedRedirect("/admin/workspace/symposium-2026/registration-pilot"));
  }
  return <>
    <FullWidthWhenCollapsed />
    <PageHero eyebrow="2026 Symposium" title="Registration pilot" icon={<ClipboardList />} />
    <SymposiumRegistrationPilot searchParams={await searchParams} />
  </>;
}
