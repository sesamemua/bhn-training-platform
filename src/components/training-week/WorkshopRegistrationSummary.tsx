import { registrationSummary, type SessionCapacity } from "@/lib/training-week/capacity";
import { Armchair, CheckCircle2, CircleHelp, Clock3, UserMinus, Users, XCircle, type LucideIcon } from "lucide-react";

export function WorkshopRegistrationSummary({ cap, compact = false }: { cap: SessionCapacity; compact?: boolean }) {
  const d = cap.decisions;
  const metrics: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Approved", value: d.approved, icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400" },
    { label: "To be decided", value: d.undecided, icon: CircleHelp, tone: "text-amber-700 dark:text-amber-400" },
    { label: "Declined", value: d.declined, icon: XCircle, tone: "text-rose-700 dark:text-rose-400" },
    ...(d.waitlisted ? [{ label: "Waitlisted", value: d.waitlisted, icon: Clock3, tone: "text-violet-700 dark:text-violet-400" }] : []),
    ...(d.withdrawn ? [{ label: "Can't attend", value: d.withdrawn, icon: UserMinus, tone: "text-zinc-600 dark:text-zinc-400" }] : []),
    { label: "Total", value: cap.records, icon: Users, tone: "text-blue-700 dark:text-blue-400" },
    { label: "Remaining seats", value: cap.remaining, icon: Armchair, tone: "text-cyan-700 dark:text-cyan-400" },
  ];
  return (
    <dl aria-label={registrationSummary(cap)} className={compact ? "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,110px),1fr))] gap-x-4 gap-y-1" : "my-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,136px),1fr))] gap-1.5"}>
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className={compact ? "flex min-h-7 min-w-0 items-baseline justify-between gap-2" : "min-h-[56px] min-w-0 px-2 py-1"} title={label === "Remaining seats" ? "Trainee capacity minus actual approved trainee seats. Staff, guests and recommendations do not use these seats." : undefined}>
          <dt className="flex items-start gap-1 text-[11px] font-semibold leading-tight text-muted">{!compact && <Icon size={13} className="shrink-0" aria-hidden="true" />}<span>{label}</span></dt>
          <dd className={`${compact ? "shrink-0 text-[22px]" : "mt-0.5 text-[26px]"} font-bold leading-none tabular-nums ${tone}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
