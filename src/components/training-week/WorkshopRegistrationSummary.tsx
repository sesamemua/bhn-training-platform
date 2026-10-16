import { registrationSummary, type SessionCapacity } from "@/lib/training-week/capacity";

export function WorkshopRegistrationSummary({ cap }: { cap: SessionCapacity }) {
  const d = cap.decisions;
  const metrics: [string, number][] = [
    ["Approved", d.approved], ["To be decided", d.undecided], ["Declined", d.declined],
    ...(d.waitlisted ? [["Waitlisted", d.waitlisted] as [string, number]] : []),
    ...(d.withdrawn ? [["Can't attend", d.withdrawn] as [string, number]] : []),
    ["Total", cap.records], ["Remaining seats", cap.remaining],
  ];
  return (
    <dl aria-label={registrationSummary(cap)} className="my-3 flex flex-wrap gap-x-6 gap-y-2">
      {metrics.map(([label, value]) => (
        <div key={label} title={label === "Remaining seats" ? "Trainee capacity minus actual approved trainee seats. Staff, guests and recommendations do not use these seats." : undefined}>
          <dt className="text-[13px] font-semibold leading-snug text-muted">{label}</dt>
          <dd className="text-[24px] font-bold leading-tight tabular-nums text-fg">
            {value}
            {label === "Remaining seats" && <span className="block text-[11px] font-normal text-muted">Trainee seats</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
