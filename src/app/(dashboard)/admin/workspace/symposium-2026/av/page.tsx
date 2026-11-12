/**
 * Workspace → 2026 Symposium → AV.
 *
 * One sidebar tab for both years. This bare path opens this year's
 * quote; the 2025 comparison is a tab on that page with its own URL.
 */
import { redirect } from "next/navigation";

export default function SymposiumAvIndexPage() {
  redirect("/admin/workspace/symposium-2026/av/2026");
}
