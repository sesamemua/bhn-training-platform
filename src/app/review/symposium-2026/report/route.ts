import { redirect } from "next/navigation";
import { deniedRedirect, requireRole } from "@/lib/auth";
import { REPORT_PATH } from "@/lib/symposium-report/document";

export async function GET() {
  const staff = await requireRole("instructor").catch(() => null);
  redirect(staff ? REPORT_PATH : await deniedRedirect(REPORT_PATH));
}
