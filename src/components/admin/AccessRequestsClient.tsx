"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, X, Building2, GraduationCap, ExternalLink, Mail, MessageSquare } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Req {
  id: string;
  kind: string;
  email: string;
  name: string | null;
  company: string | null;
  website: string | null;
  message: string | null;
  source: string;
  status: string;
  createdAt: string;
  /** A User with this email already exists (checked on the server). */
  hasAccount?: boolean;
}

/** The "Email welcome" draft for a trainee request. While public sign-up
 *  is closed it must not send them to /register, and it is only offered
 *  once the account exists (see below), so "your account is set up" is
 *  true when it is sent. */
export function traineeWelcomeBody(registrationOpen: boolean, siteUrl: string): string {
  return registrationOpen
    ? `Hi,\n\nThanks for your interest in BHN Training. You can sign up directly at ${siteUrl}/register — no invite needed.\n\n`
    : `Hi,\n\nThanks for your interest in BHN Training. Your account is set up for this email address. Sign in at ${siteUrl}/login — we'll send your temporary password separately.\n\n`;
}

export function AccessRequestsClient({
  initial,
  registrationOpen,
  siteUrl,
}: {
  initial: Req[];
  /** Server's sign-up switch (lib/auth/registration). */
  registrationOpen: boolean;
  /** This deployment's origin, so drafts never link to another one. */
  siteUrl: string;
}) {
  const [list, setList] = useState(initial);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => ({
    pending: list.filter((r) => r.status === "pending").length,
    approved: list.filter((r) => r.status === "approved").length,
    rejected: list.filter((r) => r.status === "rejected").length,
  }), [list]);

  const filtered = list.filter((r) => r.status === tab);

  async function setStatus(req: Req, status: "approved" | "rejected" | "pending") {
    setBusy(req.id);
    try {
      const r = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: req.id, status }),
      });
      if (r.ok) {
        setList((cur) => cur.map((x) => (x.id === req.id ? { ...x, status } : x)));
      }
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-line">
        <Tab active={tab === "pending"} onClick={() => setTab("pending")} label={`Pending ${counts.pending}`} />
        <Tab active={tab === "approved"} onClick={() => setTab("approved")} label={`Approved ${counts.approved}`} />
        <Tab active={tab === "rejected"} onClick={() => setTab("rejected")} label={`Rejected ${counts.rejected}`} />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-line rounded-2xl p-12 text-center">
          <p className="text-sm text-muted">No {tab} requests.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li key={r.id} className="bg-card border border-line rounded-2xl p-5">
              <div className="flex items-start gap-3 flex-wrap">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  r.kind === "employer"
                    ? "bg-brand-50 text-brand-600"
                    : "bg-emerald-50 text-emerald-600",
                )}>
                  {r.kind === "employer" ? <Building2 size={18} /> : <GraduationCap size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-fg">{r.name ?? r.email}</p>
                  <p className="text-xs text-muted inline-flex items-center gap-3 flex-wrap mt-0.5">
                    <span className="inline-flex items-center gap-1"><Mail size={11} /> {r.email}</span>
                    {r.company && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {r.company}</span>}
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                        <ExternalLink size={11} /> website
                      </a>
                    )}
                  </p>
                  {r.message && (
                    <p className="text-sm text-muted mt-2 leading-relaxed">
                      <MessageSquare size={11} className="inline -mt-0.5 mr-1.5 text-subtle" />
                      {r.message}
                    </p>
                  )}
                  <p className="text-[11px] text-subtle mt-2">
                    via /{r.source} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {r.status === "pending" && (
                    <>
                      {r.kind === "employer" ? (
                        <Link
                          href={`/admin/employer-invites?email=${encodeURIComponent(r.email)}&company=${encodeURIComponent(r.company ?? "")}&website=${encodeURIComponent(r.website ?? "")}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 size={12} /> Mint invite →
                        </Link>
                      ) : (
                        <>
                          {/* Sign-up is closed, so the account is made first
                              and the welcome only appears once it exists —
                              otherwise it would point at a login that fails. */}
                          {!registrationOpen && !r.hasAccount ? (
                            <Link
                              href={`/admin/users?q=${encodeURIComponent(r.email)}`}
                              title="No account with this email yet. Create it, then come back to email a welcome."
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 inline-flex items-center gap-1.5"
                            >
                              <GraduationCap size={12} /> Create user →
                            </Link>
                          ) : (
                            <a
                              href={`mailto:${r.email}?subject=BHN%20Training%20welcome&body=${encodeURIComponent(traineeWelcomeBody(registrationOpen, siteUrl))}`}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white border border-brand-700 hover:bg-brand-700 inline-flex items-center gap-1.5"
                            >
                              <Mail size={12} /> Email welcome
                            </a>
                          )}
                        </>
                      )}
                      <button onClick={() => setStatus(r, "approved")} disabled={busy === r.id} className="text-[11px] font-medium px-3 py-1 rounded-lg text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-1">
                        <CheckCircle2 size={11} /> Mark approved
                      </button>
                      <button onClick={() => setStatus(r, "rejected")} disabled={busy === r.id} className="text-[11px] font-medium px-3 py-1 rounded-lg text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1">
                        <X size={11} /> Reject
                      </button>
                    </>
                  )}
                  {r.status !== "pending" && (
                    <button onClick={() => setStatus(r, "pending")} disabled={busy === r.id} className="text-[11px] text-muted hover:text-fg">
                      ← Move to pending
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "text-brand-700 border-brand-600"
          : "text-muted border-transparent hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}
