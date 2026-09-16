/**
 * /admin/committees — legacy redirect.
 *
 * The combined-committees admin page was split into per-committee
 * surfaces so each committee's entry point lives under its own
 * pillar's admin nav (HQP under ENGAGE, EQUIP Review under EQUIP).
 * This route used to host both rosters; it now redirects to the
 * HQP page since that's where the bulk of the workflow surfaces
 * lived. The EQUIP Review roster has its own page at
 * /admin/committees/equip-review.
 *
 * Where ENGAGE is paused (src/lib/deploy/paused.ts) the HQP pages are not
 * deployed, so the redirect goes to the EQUIP Review roster instead.
 */
import { redirect } from "next/navigation";
import { isPausedPath } from "@/lib/deploy/paused";

export const dynamic = "force-dynamic";

export default function AdminCommitteesIndexPage(): never {
  redirect(
    isPausedPath("/admin/committees/hqp")
      ? "/admin/committees/equip-review"
      : "/admin/committees/hqp",
  );
}
