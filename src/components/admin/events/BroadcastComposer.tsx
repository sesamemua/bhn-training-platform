"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

const AUDIENCE_OPTIONS = [
  { value: "all",        label: "Everyone",                description: "All non-cancelled registrants" },
  { value: "confirmed",  label: "Confirmed only",          description: "Just confirmed seats" },
  { value: "pending",    label: "Pending approval",        description: "Awaiting admin approval" },
  { value: "waitlist",   label: "Waitlist",                description: "On the waitlist only" },
  { value: "checked_in", label: "Already checked in",      description: "Useful for post-event follow-ups" },
] as const;

export function BroadcastComposer({ slug, audienceCounts }: {
  slug: string;
  audienceCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<string>("confirmed");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  const canSubmit = !sending && subject.trim().length > 0 && body.trim().length > 10;
  const audCount = audienceCounts[audience] ?? 0;

  async function send() {
    if (!canSubmit) return;
    if (!(await confirmDialog({ title: `Send "${subject}" to ${audCount} recipient${audCount === 1 ? "" : "s"}?`, confirmLabel: "Send", tone: "warning" }))) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/admin/events/${slug}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.trim(), body: body.trim(), audienceFilter: audience }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setError(json.error ?? `Failed (${res.status})`);
      setSending(false);
      return;
    }
    setResult({ sent: json.sentCount ?? 0, total: json.recipientCount ?? 0 });
    setSubject("");
    setBody("");
    setSending(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {confirmNode}
      {result && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 inline-flex items-start gap-2.5">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Broadcast sent</p>
            <p className="text-xs mt-0.5">{result.sent} of {result.total} emails delivered.</p>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">
          Audience
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AUDIENCE_OPTIONS.map((opt) => {
            const count = audienceCounts[opt.value] ?? 0;
            const active = audience === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAudience(opt.value)}
                className={`text-left rounded-xl border-2 p-3 transition-colors ${
                  active ? "border-brand-500 bg-brand-50" : "border-line bg-card hover:border-brand-200"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold text-sm ${active ? "text-brand-700" : "text-fg"}`}>{opt.label}</span>
                  <span className="font-mono tabular-nums text-xs text-fg-subtle">{count}</span>
                </div>
                <p className="text-xs text-muted mt-0.5">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">
          Subject <span className="text-rose-700">*</span>
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Important update about tomorrow's session"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">
          Body (markdown) <span className="text-rose-700">*</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder="Hi everyone,&#10;&#10;Quick reminder that we're meeting in **room 204** tomorrow at 10am. Don't forget your name tag.&#10;&#10;Looking forward to seeing you all!"
          className="w-full bg-background border border-line rounded-lg px-3 py-2 text-sm leading-relaxed resize-y font-mono"
        />
        <p className="text-xs text-subtle mt-1.5">
          Supports <strong>**bold**</strong>, <em>*italic*</em>, and <code className="font-mono bg-elevated px-1 rounded">[link](url)</code> markdown. Double-newline creates a paragraph break.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 inline-flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-line">
        <button
          type="button"
          onClick={send}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:bg-elevated disabled:text-subtle disabled:cursor-not-allowed transition-colors"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {sending ? "Sending…" : `Send to ${audCount} ${audCount === 1 ? "person" : "people"}`}
        </button>
      </div>
    </div>
  );
}
