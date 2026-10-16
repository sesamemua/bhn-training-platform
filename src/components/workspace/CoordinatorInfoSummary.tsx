import { Fragment } from "react";
import type { CoordinatorInfo } from "@/lib/training-week/coordinator-info";

export function CoordinatorInfoCells({ info }: { info?: CoordinatorInfo }) {
  return (
    <>
      {Object.entries({ institution: info?.institution, position: info?.position, company: info?.company, participation: info?.participation }).map(([field, value]) => (
        <td key={field} className="min-w-[8rem] max-w-[14rem] break-words px-2 py-2 text-[13px] text-fg">{value || (info ? "Not supplied" : "—")}</td>
      ))}
    </>
  );
}

export function CoordinatorInfoSummary({ info }: { info?: CoordinatorInfo }) {
  if (!info) return null;
  return (
    <section aria-label="Information from Roshni" className="my-2 max-w-xl border-l-2 border-brand-500 pl-2">
      <h5 className="text-[12px] font-bold text-fg">From Roshni&apos;s email · Innovation Ignited</h5>
      <p className="mt-0.5 text-[11px] text-muted">Supplied separately from the registrant&apos;s answers.</p>
      <dl className="mt-1 grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11.5px]">
        {Object.entries({ "Name on list": info.name, Institution: info.institution, "Current role": info.position, "Company / venture": info.company, Participation: info.participation }).map(([label, value]) => (
          <Fragment key={label}><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words text-fg">{value || "Not supplied"}</dd></Fragment>
        ))}
      </dl>
      <details className="mt-1 text-[11px] text-muted">
        <summary className="cursor-pointer">Source and matching details</summary>
        <p className="mt-1 break-words">Email match: {info.emailSource}</p>
        <p>Recorded by {info.recordedBy} · {new Date(info.recordedAt).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })} Toronto</p>
      </details>
    </section>
  );
}
