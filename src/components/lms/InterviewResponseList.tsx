"use client";
import { useState } from "react";
import { Calendar, CheckCircle2, XCircle, Building2, User, MapPin, Video, Phone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Interview {
  id: string;
  status: string;
  format: string | null;
  location: string | null;
  notes: string | null;
  proposedSlots: string[];
  acceptedSlot: string | null;
  posting: { title: string; companyName: string };
  scheduledByName: string | null;
  createdAt: string;
}

export function InterviewResponseList({ interviews }: { interviews: Interview[] }) {
  const [list, setList] = useState(interviews);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function accept(id: string, slot: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/interviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acceptedSlot: slot }),
      });
      if (r.ok) {
        setList((cur) => cur.map((i) => (i.id === id ? { ...i, status: "accepted", acceptedSlot: slot } : i)));
      }
    } finally { setBusy(null); }
  }
  async function decline(id: string) {
    if (!(await confirmDialog({ title: "Decline this interview?", confirmLabel: "Decline", tone: "warning" }))) return;
    setBusy(id);
    try {
      const r = await fetch("/api/interviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decline: true }),
      });
      if (r.ok) {
        setList((cur) => cur.filter((i) => i.id !== id));
      }
    } finally { setBusy(null); }
  }

  if (list.length === 0) {
    return (
      <div className="bg-card border border-dashed border-line rounded-2xl p-10 text-center space-y-3">
        <span className="inline-flex w-12 h-12 rounded-xl bg-brand-50 text-brand-700 items-center justify-center ring-1 ring-inset ring-brand-200">
          <Calendar size={20} />
        </span>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-fg">No interviews scheduled</h3>
          <p className="text-sm text-fg-muted max-w-md mx-auto">
            When an employer schedules an interview with you, it&apos;ll show up here with the date, format, link, and any prep notes they shared.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((iv) => (
        <article key={iv.id} className="bg-card border border-line rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold inline-flex items-center gap-1.5 mb-1">
                <Building2 size={10} /> {iv.posting.companyName}
              </p>
              <h2 className="font-semibold text-fg leading-tight">{iv.posting.title}</h2>
              {iv.scheduledByName && <p className="text-xs text-muted mt-0.5"><User size={10} className="inline -mt-0.5 mr-1" />{iv.scheduledByName}</p>}
            </div>
            <span className={cn(
              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
              iv.status === "accepted"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-800 border-amber-200",
            )}>
              {iv.status === "accepted" ? "confirmed" : "awaiting your reply"}
            </span>
          </div>

          {(iv.format || iv.location) && (
            <p className="text-xs text-muted mt-2 inline-flex items-center gap-2 flex-wrap">
              {iv.format === "video" && <span className="inline-flex items-center gap-1"><Video size={11} /> Video</span>}
              {iv.format === "phone" && <span className="inline-flex items-center gap-1"><Phone size={11} /> Phone</span>}
              {iv.format === "onsite" && <span className="inline-flex items-center gap-1"><MapPin size={11} /> Onsite</span>}
              {iv.location && <span className="text-fg font-medium">{iv.location}</span>}
            </p>
          )}
          {iv.notes && (
            <p className="text-sm text-muted mt-2 leading-relaxed">
              <MessageSquare size={11} className="inline -mt-0.5 mr-1.5 text-subtle" />
              {iv.notes}
            </p>
          )}

          {iv.status === "accepted" && iv.acceptedSlot ? (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-emerald-900 inline-flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Confirmed for {new Date(iv.acceptedSlot).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
              </p>
              <p className="text-xs text-emerald-700 mt-1">Add it to your calendar — we don&apos;t auto-send invites yet.</p>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-subtle font-semibold mb-1.5">Pick a time</p>
              <div className="space-y-1.5">
                {iv.proposedSlots.map((slot) => {
                  const d = new Date(slot);
                  return (
                    <button
                      key={slot}
                      onClick={() => accept(iv.id, slot)}
                      disabled={busy === iv.id}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-elevated/40 border border-line hover:border-emerald-300 hover:bg-emerald-50 transition-colors text-left text-sm disabled:opacity-60"
                    >
                      <span className="font-medium text-fg">
                        {d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-xs text-emerald-700 font-semibold">Accept →</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => decline(iv.id)}
                disabled={busy === iv.id}
                className="mt-3 inline-flex items-center gap-1 text-xs text-muted hover:text-rose-700 transition-colors"
              >
                <XCircle size={11} /> None of these work — decline
              </button>
            </div>
          )}
        </article>
      ))}
      {confirmNode}
    </div>
  );
}
