/**
 * Workspace → 2026 Symposium → AV.
 *
 * There are two AV pages now — the 2025 comparison this URL used to be,
 * and the September 2026 quotes — so this bare path sends you to the
 * older one rather than 404ing a link somebody bookmarked or put in an
 * email. It is not a page; the sidebar points at the dated routes.
 */
import { redirect } from "next/navigation";

export default function SymposiumAvIndexPage() {
  redirect("/admin/workspace/symposium-2026/av/2025");
}
