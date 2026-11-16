/** Outreach lands on the CRM dashboard. */
import { redirect } from "next/navigation";

export default function OutreachIndexPage() {
  redirect("/admin/workspace/outreach/dashboard");
}
