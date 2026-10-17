import { registrationSummary, type SessionCapacity } from "@/lib/training-week/capacity";
import { Armchair, CheckCircle2, CircleHelp, Clock3, UserMinus, Users, XCircle, type LucideIcon } from "lucide-react";

const digitRows = [
  ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
];

function DotMatrixNumber({ value }: { value: number }) {
  const digits = String(value).padStart(2, "0");
  return <>
    <svg aria-hidden="true" data-dot-matrix={value} viewBox={`0 0 ${digits.length * 18 - 3} 21`} width={digits.length * 18 - 3} height={21} className="h-[42px] w-auto max-w-full">
      {[...digits].map((digit, index) => digitRows[Number(digit)].map((row, y) => [...row].map((lit, x) => (
        <circle key={`${index}:${y}:${x}`} cx={index * 18 + x * 3 + 1.5} cy={y * 3 + 1.5} r={0.95} fill={lit === "1" ? "currentColor" : "#1c382a"} />
      ))))}
    </svg>
    <span className="sr-only">{value}</span>
  </>;
}

export function WorkshopRegistrationSummary({ cap, compact = false }: { cap: SessionCapacity; compact?: boolean }) {
  const d = cap.decisions;
  const metrics: { label: string; value: number; icon: LucideIcon; tone: string }[] = [
    { label: "Approved", value: d.approved, icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-400" },
    { label: "To be decided", value: d.undecided, icon: CircleHelp, tone: "text-amber-700 dark:text-amber-400" },
    { label: "Declined", value: d.declined, icon: XCircle, tone: "text-rose-700 dark:text-rose-400" },
    ...(compact || d.waitlisted ? [{ label: "Waitlisted", value: d.waitlisted, icon: Clock3, tone: "text-violet-700 dark:text-violet-400" }] : []),
    ...(compact || d.withdrawn ? [{ label: "Can't attend", value: d.withdrawn, icon: UserMinus, tone: "text-zinc-600 dark:text-zinc-400" }] : []),
    { label: "Total", value: cap.records, icon: Users, tone: "text-blue-700 dark:text-blue-400" },
    { label: "Remaining seats", value: cap.remaining, icon: Armchair, tone: "text-cyan-700 dark:text-cyan-400" },
  ];
  if (compact) return (
    <div className="training-phosphor-panel">
      <dl aria-label={registrationSummary(cap)} className="training-phosphor-grid">
        {metrics.map(({ label, value }, index) => (
          <div key={label} className={index === 0 ? "training-phosphor-primary" : "training-phosphor-metric"}
            title={label === "Remaining seats" ? "Trainee capacity minus actual approved trainee seats. Staff, guests and recommendations do not use these seats." : undefined}>
            <dt>{label}</dt>
            <dd>{index === 0 ? <DotMatrixNumber value={value} /> : value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
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
