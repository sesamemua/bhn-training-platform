"use client";

/**
 * Per-row delete on the admin EQUIP queue (/admin/equip).
 *
 * Same protected control as the resume manager's hard-delete
 * (LaunchSwitch — glass cover, then a countdown that can still be
 * aborted). No separate window.confirm()/ConfirmDialog stacked on top:
 * per LaunchSwitch's own doc comment, the cover-flip + countdown +
 * abort already IS the deliberate-commitment ritual, and a second
 * "are you sure?" popup on top would be redundant — and here it would
 * be worse than redundant, since it would have to appear AFTER the
 * switch has already shown its "DELETED" chip, contradicting what the
 * person just watched happen.
 *
 * The one thing LaunchSwitch's generic ritual can't say on its own is
 * the EQUIP-specific consequence: deleting an approved/funded
 * application with money against it returns that amount to the
 * applicant's $5,000 cap (see canDelete in src/lib/equip/delete.ts).
 * That gets said as a small line of visible text NEXT TO the switch —
 * seen before arming, not sprung afterward — rather than crammed into
 * the switch's own tiny label or bolted on as a second dialog.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { LaunchSwitch } from "@/components/ui/LaunchSwitch";

export function DeleteApplicationButton({
  applicationId,
  applicantName,
  status,
  approvedAmount,
}: {
  applicationId: string;
  applicantName: string;
  status: string;
  approvedAmount: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const decided = status === "approved" || status === "funded";
  const affectsCap = decided && (approvedAmount ?? 0) > 0;

  async function handleFire() {
    setError(null);
    const res = await fetch(
      `/api/admin/equip/applications/${applicationId}${affectsCap ? "?confirm=1" : ""}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Delete failed (HTTP ${res.status}).`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      {affectsCap && (
        <p className="flex items-center gap-1 text-[9.5px] font-semibold text-amber-600 whitespace-nowrap">
          <AlertTriangle size={10} className="shrink-0" />
          ${(approvedAmount ?? 0).toLocaleString()} returns to their cap
        </p>
      )}
      <LaunchSwitch
        label="DELETE"
        ariaLabel={`Delete ${applicantName}'s application — protected switch with 10-second countdown`}
        onFire={handleFire}
      />
      {error && (
        <p className="max-w-[10rem] text-right text-[10px] font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
