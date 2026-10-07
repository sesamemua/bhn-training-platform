import { ArrowRight } from "lucide-react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import type { projectWeekSeats } from "@/lib/allocation/seat-projection";
import { workshopTone } from "@/lib/allocation/workshop-colour";

export function SeatProjection({ projection, workshops, onReview, onCapacity }: {
  projection: ReturnType<typeof projectWeekSeats>;
  workshops: AdminWorkshop[];
  onReview: () => void;
  onCapacity: () => void;
}) {
  const { rows, totals, problem } = projection;
  const cell = "px-3 py-2 text-right tabular-nums";
  return (
    <section aria-label="Projected workshop attendance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-fg">Projected workshop attendance</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onCapacity} className="text-[12px] font-semibold text-fg underline underline-offset-4">Change capacity</button>
          <button type="button" onClick={onReview} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated">
            Review seat suggestions <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-1 text-[12px] text-muted">Forecast from saved rules, ranked choices and session times. Existing approvals are kept. No decisions have been applied.</p>
      {problem ? (
        <p role="alert" className="mt-3 border-l-2 border-amber-600 pl-3 text-[13px] text-fg">Projection unavailable: {problem} Actual approvals and requests are shown below.</p>
      ) : (
        <dl className="my-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {[["Projected approvals", totals.projectedApproved], ["Projected waitlist", totals.projectedWaitlisted], ["Seats remaining", totals.remaining], ["Total requests", totals.requested]].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[12px] text-muted">{label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
          <caption className="sr-only">Requests, actual approvals and projected decisions per workshop. Counts are session seats, not unique people.</caption>
          <thead className="bg-elevated">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-[11px] text-muted">Workshop</th>
              {["Requests", "Capacity", "Approved now", "Suggested additions", "Projected approvals", "Projected waitlist", "Seats left", "Internal"].map((heading) => (
                <th key={heading} scope="col" className={`${cell} text-[11px] text-muted`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const w = workshops.find((w) => w.id === row.id)!;
              const over = row.projectedApproved > row.capacity;
              return (
                <tr key={row.id} className="border-t border-line">
                  <th scope="row" className="min-w-[220px] max-w-[320px] px-3 py-3 text-left font-normal">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${workshopTone(w.slug).dot}`} aria-hidden />
                    <span className="break-words font-semibold text-fg">{w.title}</span>
                    <span className="mt-1 block text-[11px] text-muted">{new Date(w.startDateTime).toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short" })}</span>
                    {!problem && <div role="img" aria-label={`${row.projectedApproved} projected approvals of ${row.capacity} seats`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                      <div className={`h-full ${over ? "bg-rose-500" : "bg-brand"}`} style={{ width: `${Math.min(100, row.projectedApproved / Math.max(1, row.capacity) * 100)}%` }} />
                    </div>}
                    {row.warnings.map((warning) => <p key={warning} className="mt-1 text-[11px] font-semibold text-fg">Review: {warning}</p>)}
                    {!problem && row.unresolved > 0 && <p className="mt-1 text-[11px] text-muted">{row.unresolved} without a suggested decision</p>}
                  </th>
                  <td className={`${cell} text-muted`}>{row.requested}</td>
                  <td className={`${cell} text-fg`}>{row.capacity}</td>
                  <td className={`${cell} text-muted`}>{row.approved}</td>
                  <td className={`${cell} text-muted`}>{problem ? "Unavailable" : `+${row.suggested}`}</td>
                  <td className={`${cell} font-bold text-fg`}>{problem ? "Unavailable" : row.projectedApproved}{over && <span className="block text-[10px]">Over capacity</span>}</td>
                  <td className={`${cell} text-fg`}>{problem ? "Unavailable" : row.projectedWaitlisted}</td>
                  <td className={`${cell} text-fg`}>{problem ? "Unavailable" : row.remaining}</td>
                  <td className={`${cell} text-muted`}>{row.internal}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">No active workshops.</td></tr>}
          </tbody>
          <tfoot className="border-t-2 border-line bg-elevated font-semibold text-fg">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">All {rows.length} sessions</th>
              <td className={cell}>{totals.requested}</td><td className={cell}>{totals.capacity}</td><td className={cell}>{totals.approved}</td>
              <td className={cell}>{problem ? "Unavailable" : `+${totals.suggested}`}</td>
              <td className={cell}>{problem ? "Unavailable" : totals.projectedApproved}</td><td className={cell}>{problem ? "Unavailable" : totals.projectedWaitlisted}</td>
              <td className={cell}>{problem ? "Unavailable" : totals.remaining}</td><td className={cell}>{totals.internal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">Counts are session seats, not unique people. Projected waitlists include capacity and time conflicts. Staff and guests are separate from student capacity.</p>
    </section>
  );
}
