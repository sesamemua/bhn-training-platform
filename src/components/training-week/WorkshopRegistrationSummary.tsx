import { registrationSummary, type SessionCapacity } from "@/lib/training-week/capacity";
import { Armchair, CheckCircle2, CircleHelp, Clock3, UserMinus, Users, XCircle, type LucideIcon } from "lucide-react";

export function WorkshopRegistrationSummary({ cap }: { cap: SessionCapacity }) {
  const d = cap.decisions;
  const metrics: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Approved", value: d.approved, icon: CheckCircle2, tone: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/15" },
    { label: "To be decided", value: d.undecided, icon: CircleHelp, tone: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/15" },
    { label: "Declined", value: d.declined, icon: XCircle, tone: "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/15" },
    ...(d.waitlisted ? [{ label: "Waitlisted", value: d.waitlisted, icon: Clock3, tone: "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/15" }] : []),
    ...(d.withdrawn ? [{ label: "Can't attend", value: d.withdrawn, icon: UserMinus, tone: "border-zinc-300 bg-zinc-100 dark:border-zinc-500/40 dark:bg-zinc-500/15" }] : []),
    { label: "Total", value: cap.records, icon: Users, tone: "border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/15" },
    { label: "Remaining seats", value: cap.remaining, icon: Armchair, tone: "border-cyan-300 bg-cyan-50 dark:border-cyan-500/40 dark:bg-cyan-500/15" },
  ];
  return (
    <dl aria-label={registrationSummary(cap)} className="my-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,136px),1fr))] gap-1.5">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className={`min-h-[56px] min-w-0 rounded-md border border-l-[3px] px-2 py-1 text-fg ${tone}`} title={label === "Remaining seats" ? "Trainee capacity minus actual approved trainee seats. Staff, guests and recommendations do not use these seats." : undefined}>
          <dt className="flex items-start gap-1 text-[11px] font-semibold leading-tight"><Icon size={13} className="shrink-0" aria-hidden="true" /><span>{label}</span></dt>
          <dd className="mt-0.5 text-[26px] font-bold leading-none tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
