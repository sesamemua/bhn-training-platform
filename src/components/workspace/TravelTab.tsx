"use client";

/**
 * Training admin → Travel follow-up. Everyone who said their one-way trip
 * to downtown Toronto is over 2 hours: they need a separate follow-up
 * (travel support). Just the list for now — copy it, or download a CSV.
 */
import { useMemo, useState } from "react";
import { ClipboardCopy, Download } from "lucide-react";
import type { AdminWorkshop } from "@/lib/allocation/admin-types";
import { TRAVEL_HEAD, travellerCells, travellers } from "@/lib/allocation/registrant-views";
import { toCsv } from "@/lib/formbuilder/csv";
import { downloadText, fileDate } from "@/lib/download";
import { rowsFrom } from "./RegistrantViews";

const TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/12 text-emerald-600",
  waitlist: "bg-amber-500/12 text-amber-600",
  cancelled: "bg-rose-500/10 text-rose-600",
  pending: "bg-brand-500/12 text-brand-500",
};
const LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";

export function TravelTab({ workshops }: { workshops: AdminWorkshop[] }) {
  const list = useMemo(() => travellers(rowsFrom(workshops)), [workshops]);
  const [said, setSaid] = useState<string | null>(null);
  const table = [TRAVEL_HEAD, ...list.map(travellerCells)];

  async function copy() {
    // Tab-separated, so it pastes into a spreadsheet as columns and into an email as a list.
    const text = table.map((r) => r.join("\t")).join("\n");
    try { await navigator.clipboard.writeText(text); setSaid(`Copied ${list.length} ${list.length === 1 ? "person" : "people"}.`); }
    catch { setSaid("Your browser blocked copying — use Download CSV instead."); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fg">Travelling more than 2 hours · {list.length}</p>
          <p className="text-[12.5px] text-muted">Everyone who said their one-way trip to downtown Toronto is over 2 hours. They need a separate follow-up about travel.</p>
        </div>
        <button type="button" onClick={copy} disabled={!list.length} className={BTN}><ClipboardCopy size={14} /> Copy list</button>
        <button type="button" onClick={() => downloadText(`training-week-travel-follow-up-${fileDate()}.csv`, toCsv(table))} disabled={!list.length} className={BTN}>
          <Download size={14} /> Download CSV
        </button>
        {said && <p role="status" className="basis-full text-[12px] text-fg">{said}</p>}
      </div>

      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          Nobody has said they are travelling more than 2 hours yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-elevated text-left">
                {["Name", "Email", "Postcode", "Sessions", "Registered"].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-subtle">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.personKey} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-semibold text-fg">{t.name}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-muted">{t.email}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-muted">{t.postcode || "—"}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-1">
                      {t.sessions.map((s, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-1.5 text-muted">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TONE[s.status] ?? "bg-elevated text-subtle"}`}>{LABEL[s.status] ?? s.status}</span>
                          {s.dayLabel} · {s.workshop}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-subtle">{new Date(t.appliedAt).toLocaleDateString("en-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
