"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";

interface Props {
  applicationId: string;
  status: "pending" | "rejected" | string;
  requestedAmount: number;
}

type Mode = "none" | "approve" | "reject" | "reopen";

export function CreditApplicationReview({ applicationId, status, requestedAmount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(String(requestedAmount));
  const [mode, setMode] = useState<Mode>("none");
  const [error, setError] = useState<string | null>(null);

  const isRejected = status === "rejected";
  const heading = isRejected ? "Reverse decision" : "Decide";
  const subhead = isRejected
    ? "This application was rejected — you can override and grant credits, or reopen for fresh review."
    : null;

  async function submit(decision: "approve" | "reject" | "reopen") {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { decision };
      if (note) body.note = note;
      if (decision === "approve") body.approvedAmount = Number(amount);
      const res = await fetch(`/api/admin/credit-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-subtle uppercase tracking-wider">{heading}</h3>
        {subhead && <p className="text-xs text-muted mt-1">{subhead}</p>}
        {error && <p role="alert" className="text-sm text-rose-700 mt-2">{error}</p>}
      </div>

      {mode === "none" && (
        <div className={isRejected ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3"}>
          <button
            onClick={() => setMode("approve")}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md shadow-emerald-600/25 transition-all hover:-translate-y-0.5"
          >
            <Check size={16} /> {isRejected ? "Approve anyway" : "Approve"}
          </button>
          {isRejected ? (
            <button
              onClick={() => setMode("reopen")}
              className="flex items-center justify-center gap-2 bg-card border-2 border-amber-500 text-amber-700 hover:bg-amber-50 font-semibold py-3 px-4 rounded-xl transition-all hover:-translate-y-0.5"
            >
              <RotateCcw size={16} /> Reopen for review
            </button>
          ) : (
            <button
              onClick={() => setMode("reject")}
              className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md shadow-rose-600/25 transition-all hover:-translate-y-0.5"
            >
              <X size={16} /> Reject
            </button>
          )}
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-3">
          <Field
            label="Credits to grant"
            hint={`Default is the requested amount (${requestedAmount.toLocaleString()}). Lower it to grant a partial amount.`}
          >
            <Input
              type="number"
              min={1}
              max={50000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Note for the trainee" hint="Optional. Visible on their credits page.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="" />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            <Button onClick={() => submit("approve")} loading={busy}>
              <Check size={14} /> Approve & grant {Number(amount).toLocaleString()} credits
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-3">
          <Field
            label="Reason"
            required
            hint="Trainees can see this. Be specific so they know how to resubmit if they want to."
          >
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="What was missing or didn't qualify?" />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            <Button
              onClick={() => submit("reject")}
              loading={busy}
              variant="danger"
              disabled={note.trim().length < 4}
            >
              <X size={14} /> Reject
            </Button>
          </div>
        </div>
      )}

      {mode === "reopen" && (
        <div className="space-y-3">
          <p className="text-sm text-muted leading-relaxed bg-elevated rounded-lg p-3">
            Reopening clears the rejection and the previous reviewer note, returning the application
            to <span className="font-semibold text-fg">pending</span>. The trainee&apos;s status card on
            the Credits page will update accordingly. Documents and form data are kept.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            <Button onClick={() => submit("reopen")} loading={busy}>
              <RotateCcw size={14} /> Reopen application
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
