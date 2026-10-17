import { registrationSummary, type SessionCapacity } from "@/lib/training-week/capacity";
import { Armchair, CheckCircle2, CircleHelp, Clock3, UserMinus, Users, XCircle, type LucideIcon } from "lucide-react";

export function WorkshopRegistrationSummary({ cap }: { cap: SessionCapacity }) {
  const d = cap.decisions;
  const metrics: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Approved", value: d.approved, icon: CheckCircle2, tone: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100" },
    { label: "To be decided", value: d.undecided, icon: CircleHelp, tone: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100" },
    { label: "Declined", value: d.declined, icon: XCircle, tone: "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-100" },
    ...(d.waitlisted ? [{ label: "Waitlisted", value: d.waitlisted, icon: Clock3, tone: "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-100" }] : []),
    ...(d.withdrawn ? [{ label: "Can't attend", value: d.withdrawn, icon: UserMinus, tone: "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-500/40 dark:bg-zinc-500/15 dark:text-zinc-100" }] : []),
    { label: "Total", value: cap.records, icon: Users, tone: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-100" },
    { label: "Remaining seats", value: cap.remaining, icon: Armchair, tone: "border-cyan-300 bg-cyan-50 text-cyan-950 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-100" },
  ];
  return (
    <dl aria-label={registrationSummary(cap)} className="my-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,136px),1fr))] gap-2">
      {metrics.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className={`min-h-[88px] min-w-0 rounded-md border border-l-[3px] px-3 py-2.5 ${tone}`} title={label === "Remaining seats" ? "Trainee capacity minus actual approved trainee seats. Staff, guests and recommendations do not use these seats." : undefined}>
          <dt className="flex items-start gap-1.5 text-[12px] font-semibold leading-snug"><Icon size={15} className="mt-px shrink-0" aria-hidden="true" /><span>{label}</span></dt>
          <dd className="mt-1 text-[26px] font-bold leading-tight tabular-nums">
            {value}
            {label === "Remaining seats" && <span className="block text-[11px] font-normal">Trainee seats</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
