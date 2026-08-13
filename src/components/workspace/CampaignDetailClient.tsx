"use client";

/**
 * Per-campaign roster. The chosen template arrives as raw {{placeholder}}
 * strings; we fill them live in the browser from each contact's details plus
 * the campaign-level fields (program / event / deadline / link / sender), so
 * editing those fields re-previews instantly. Per contact you can copy the
 * email, open it in your mail client, and mark them reached (which logs a
 * reach-out on the contact and advances the campaign's progress).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Megaphone, Users, BookUser, Pencil, Check, X, Copy, Mail,
  Loader2, ChevronDown, Save, Trash2, MailCheck, AlertTriangle,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export interface Recipient { personId: string; name: string; org: string; email: string; needsIntro: boolean }

interface CampaignInfo {
  id: string;
  name: string;
  status: string;
  notes: string;
  listName: string | null;
  templateId: string;
  templateLabel: string;
  templateSubject: string;
  templateBody: string;
  /** Second template for contacts who already know us; null = intro for all. */
  returningTemplateLabel: string | null;
  returningTemplateSubject: string | null;
  returningTemplateBody: string | null;
  vars: Record<string, string>;
}

const STATUSES = ["draft", "active", "done"] as const;
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-elevated text-subtle",
  active: "bg-brand-50 text-brand-700",
  done: "bg-emerald-50 text-emerald-700",
};

// Campaign-level fields that fill the template {{placeholders}} (everything
// that isn't per-contact name/org/email).
const VAR_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "senderName", label: "Your name", placeholder: "e.g. Priya Shah" },
  { key: "senderTitle", label: "Your title / team", placeholder: "e.g. Partnerships" },
  { key: "programName", label: "Program name", placeholder: "e.g. EQUIP VentureLift" },
  { key: "eventName", label: "Event name", placeholder: "e.g. BHN Biomanufacturing Symposium" },
  { key: "eventDate", label: "Event date", placeholder: "e.g. July 14, 2026" },
  { key: "deadline", label: "Deadline", placeholder: "e.g. June 30" },
  { key: "link", label: "Link", placeholder: "e.g. https://biohubnet.ca/equip" },
];

function fill(str: string, map: Record<string, string>): string {
  return str.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => map[k] ?? "");
}

// Which {{tokens}} in `text` have no value in `map` — these render as blanks in
// the sent email (e.g. "closes ." / "Apply: "). Used to warn before a send.
function unfilledTokens(text: string, map: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!(map[m[1]] ?? "").trim()) out.add(m[1]);
  }
  return [...out];
}

export function CampaignDetailClient({
  campaign,
  roster,
  sentPersonIds,
  defaultSenderName,
}: {
  campaign: CampaignInfo;
  roster: Recipient[];
  sentPersonIds: string[];
  defaultSenderName: string;
}) {
  const router = useRouter();
  const [vars, setVars] = useState<Record<string, string>>({
    senderName: defaultSenderName,
    ...campaign.vars,
  });
  const [sent, setSent] = useState<Set<string>>(new Set(sentPersonIds));
  const [status, setStatus] = useState(campaign.status);
  const [name, setName] = useState(campaign.name);
  const [renaming, setRenaming] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingVars, setSavingVars] = useState(false);
  const [varsDirty, setVarsDirty] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  // Platform sending. `picked` is what a batch would go to; nothing is
  // selected by default, so the destructive path always starts from zero.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const reached = useMemo(() => roster.filter((r) => sent.has(r.personId)).length, [roster, sent]);
  const pct = roster.length > 0 ? Math.round((reached / roster.length) * 100) : 0;

  // Campaign-level {{vars}} that the chosen templates reference but are still
  // blank — sending now would email real partners copy with visible gaps.
  const missingVars = useMemo(() => {
    const text = [
      campaign.templateSubject, campaign.templateBody,
      campaign.returningTemplateSubject ?? "", campaign.returningTemplateBody ?? "",
    ].join(" ");
    const referenced = new Set(unfilledTokens(text, {})); // all tokens (empty map ⇒ all "unfilled")
    return VAR_FIELDS.filter((f) => referenced.has(f.key) && !(vars[f.key] ?? "").trim());
  }, [campaign, vars]);

  const hasReturning = campaign.returningTemplateSubject != null;
  const newCount = useMemo(() => roster.filter((r) => r.needsIntro).length, [roster]);
  const returningCount = roster.length - newCount;

  function api(path: string, body: unknown) {
    return fetch(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  // Which version a recipient receives: the returning copy if they already
  // know us and a returning template exists, otherwise the intro copy.
  function versionFor(r: Recipient): { kind: "intro" | "returning"; subject: string; body: string } {
    if (!r.needsIntro && hasReturning) {
      return { kind: "returning", subject: campaign.returningTemplateSubject ?? "", body: campaign.returningTemplateBody ?? "" };
    }
    return { kind: "intro", subject: campaign.templateSubject, body: campaign.templateBody };
  }
  function fillsFor(r: Recipient) {
    const v = versionFor(r);
    const map = { ...vars, firstName: (r.name || "").split(" ")[0] ?? "", contactName: r.name, org: r.org, email: r.email };
    return { subject: fill(v.subject, map), body: fill(v.body, map) };
  }

  async function saveVars() {
    setSavingVars(true);
    setError(null);
    try {
      const res = await api(`/api/workspace/outreach/campaigns/${campaign.id}`, { vars });
      if (!res.ok) throw new Error();
      setVarsDirty(false); // only clear dirty / show "Saved" once it actually persisted
    } catch {
      setError("Couldn't save the details — check your connection and try again.");
    } finally {
      setSavingVars(false);
    }
  }
  async function changeStatus(s: string) {
    const prev = status;
    setStatus(s);
    setError(null);
    try {
      const res = await api(`/api/workspace/outreach/campaigns/${campaign.id}`, { status: s });
      if (!res.ok) throw new Error();
    } catch {
      setStatus(prev); // revert — don't leave the UI claiming a status that didn't save
      setError("Couldn't update the status — reverted.");
    }
  }
  async function saveName() {
    const trimmed = name.trim();
    setRenaming(false);
    if (!trimmed || trimmed === campaign.name) { setName(campaign.name); return; }
    await api(`/api/workspace/outreach/campaigns/${campaign.id}`, { name: trimmed }).catch(() => {});
    router.refresh();
  }
  async function toggleSent(r: Recipient) {
    const isSent = sent.has(r.personId);
    setSent((cur) => {
      const next = new Set(cur);
      if (isSent) next.delete(r.personId); else next.add(r.personId);
      return next;
    });
    setError(null);
    try {
      const res = await api(`/api/workspace/outreach/campaigns/${campaign.id}`,
        isSent ? { unmarkSent: r.personId } : { markSent: r.personId });
      if (!res.ok) throw new Error();
    } catch {
      // Revert the optimistic toggle — the tracker's whole value is an accurate
      // record, so a silent divergence from the server is the worst outcome.
      setSent((cur) => {
        const next = new Set(cur);
        if (isSent) next.add(r.personId); else next.delete(r.personId);
        return next;
      });
      setError(`Couldn't ${isSent ? "unmark" : "mark"} ${r.name || "that contact"} — reverted.`);
    }
  }
  async function remove() {
    if (!confirm(`Delete the campaign "${campaign.name}"? Contacts and their reach-out history are kept.`)) return;
    await fetch(`/api/workspace/outreach/campaigns/${campaign.id}`, { method: "DELETE" }).catch(() => {});
    router.push("/admin/workspace/outreach/campaigns");
  }

  async function copyEmail(r: Recipient) {
    const { subject, body } = fillsFor(r);
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopiedId(r.personId);
      setTimeout(() => setCopiedId((c) => (c === r.personId ? null : c)), 1500);
    } catch { /* clipboard blocked — ignore */ }
  }
  function mailtoHref(r: Recipient) {
    const { subject, body } = fillsFor(r);
    return `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  function togglePicked(personId: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(personId)) next.delete(personId); else next.add(personId);
      return next;
    });
  }

  /**
   * Sends in chunks of SEND_BATCH, waiting for each to return before starting
   * the next. The server caps a request at the same number so a batch can't
   * outrun the function timeout and strand itself half-sent; doing the
   * chunking here means a long list resumes correctly instead of dying.
   */
  const SEND_BATCH = 40;

  async function sendSelected() {
    const ids = [...picked].filter((id) => !sent.has(id));
    if (ids.length === 0) return;

    // Dry run first: every check runs and every message renders, but nothing
    // leaves. This is what the confirmation is based on, so what you approve
    // is what actually goes.
    setSending(true); setError(null);
    try {
      const preview = await fetch(`/api/workspace/outreach/campaigns/${campaign.id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personIds: ids.slice(0, SEND_BATCH), dryRun: true }),
      }).then((r) => r.json()).catch(() => null);
      if (!preview?.ok) { setError(preview?.error ?? "Couldn't prepare the send."); return; }

      const willSend = ids.length - (preview.skipped ?? 0);
      const sample = (preview.outcomes ?? []).find((o: { status: string }) => o.status === "sent");
      const ok = await confirmDialog({
        title: `Send to ${willSend} ${willSend === 1 ? "contact" : "contacts"}?`,
        description:
          `This sends real email from info@biohubnet.ca and cannot be undone.` +
          (preview.skipped ? ` ${preview.skipped} will be skipped (no address, invalid, unsubscribed, or already sent).` : "") +
          (sample?.subject ? `\n\nFirst message — subject: “${sample.subject}”` : ""),
        confirmLabel: `Send ${willSend}`,
        cancelLabel: "Don't send",
        tone: "destructive",
      });
      if (!ok) return;

      setProgress({ done: 0, total: ids.length });
      let done = 0;
      for (let i = 0; i < ids.length; i += SEND_BATCH) {
        const chunk = ids.slice(i, i + SEND_BATCH);
        const res = await fetch(`/api/workspace/outreach/campaigns/${campaign.id}/send`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personIds: chunk }),
        }).then((r) => r.json()).catch(() => null);
        if (!res?.ok) { setError(res?.error ?? "The send stopped part-way. Nothing after this point was sent."); break; }
        setSent((cur) => {
          const next = new Set(cur);
          for (const o of res.outcomes ?? []) if (o.status === "sent") next.add(o.personId);
          return next;
        });
        done += chunk.length;
        setProgress({ done, total: ids.length });
      }
      setPicked(new Set());
    } finally {
      setSending(false);
      setTimeout(() => setProgress(null), 4000);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function setVar(key: string, value: string) {
    setVars((cur) => ({ ...cur, [key]: value }));
    setVarsDirty(true);
  }

  const miniBtn = "inline-flex h-7 items-center gap-1 rounded-md border border-line bg-card-solid px-2 text-[11px] font-semibold text-fg hover:bg-elevated disabled:opacity-40";

  return (
    <div className="space-y-5">
      <Link href="/admin/workspace/outreach/campaigns" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg">
        <ArrowLeft size={14} /> All campaigns
      </Link>

      {confirmNode}

      {picked.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-brand-300 bg-brand-50 px-4 py-2.5">
          <span className="text-sm font-bold text-brand-900">{picked.size} selected</span>
          <button
            type="button"
            onClick={sendSelected}
            disabled={sending}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
            {sending ? "Sending…" : "Send from info@biohubnet.ca"}
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className="text-xs font-semibold text-brand-800 hover:underline">
            Clear
          </button>
          {progress && (
            <span className="ml-auto text-xs font-medium tabular-nums text-brand-900">
              {progress.done} / {progress.total}
            </span>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Header */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {renaming ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setRenaming(false); setName(campaign.name); } }}
                  className="w-72 rounded-md border border-line bg-card-solid px-2 py-1 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button type="button" onClick={saveName} className="text-emerald-700 hover:text-emerald-900"><Check size={16} /></button>
                <button type="button" onClick={() => { setRenaming(false); setName(campaign.name); }} className="text-muted hover:text-fg"><X size={16} /></button>
              </span>
            ) : (
              <h1 className="group inline-flex items-center gap-2 text-xl font-bold text-fg">
                {name}
                <button type="button" onClick={() => setRenaming(true)} className="text-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"><Pencil size={14} /></button>
              </h1>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1">
                {campaign.listName ? <BookUser size={13} /> : <Users size={13} />}
                {campaign.listName ?? "Everyone in the directory"}
              </span>
              <span className="inline-flex items-center gap-1"><Megaphone size={13} /> Intro: {campaign.templateLabel}</span>
              {hasReturning && (
                <span className="inline-flex items-center gap-1"><MailCheck size={13} /> Returning: {campaign.returningTemplateLabel}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-elevated/60 p-0.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStatus(s)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors",
                    status === s ? (STATUS_STYLE[s] ?? "bg-card-solid text-fg") + " shadow-card-rest" : "text-muted hover:text-fg",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <button type="button" onClick={remove} title="Delete campaign" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-card-solid text-muted hover:bg-elevated hover:text-rose-700">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-subtle">
            <span className="font-semibold text-fg">{reached} of {roster.length} reached</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      {/* Email details (fill the placeholders) */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg">Email details</h2>
            <p className="text-[12px] text-muted">These fill the template’s placeholders. Each contact’s name, org and email come from their record.</p>
          </div>
          <button
            type="button"
            onClick={saveVars}
            disabled={savingVars || !varsDirty}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {savingVars ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {varsDirty ? "Save details" : "Saved"}
          </button>
        </div>
        {missingVars.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Still blank — these will show as gaps in the sent email:{" "}
              <span className="font-semibold">{missingVars.map((f) => f.label).join(", ")}</span>. Fill them before you Copy or Email anyone.
            </span>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VAR_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[11px] font-semibold text-subtle">{f.label}</span>
              <input
                value={vars[f.key] ?? ""}
                onChange={(e) => setVar(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>
          ))}
        </div>
      </Card>

      {/* Roster */}
      <Card className="p-0">
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Recipients <span className="text-subtle">({roster.length})</span></h2>
            <span className="text-[11px] text-muted">{newCount} new · {returningCount} returning</span>
          </div>
          {returningCount > 0 && !hasReturning && (
            <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              {returningCount} {returningCount === 1 ? "contact already knows" : "contacts already know"} you, so they will get the intro too. Add a returning template (when creating a campaign) so they open with a thank-you for their earlier support instead.
            </p>
          )}
        </div>
        {roster.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            This audience has no contacts yet — add them on the <Link href="/admin/workspace/outreach/contacts" className="font-semibold text-brand-700 hover:underline">Contacts</Link> page.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {roster.map((r) => {
              const isSent = sent.has(r.personId);
              const isOpen = expanded.has(r.personId);
              const preview = isOpen ? fillsFor(r) : null;
              const ver = versionFor(r);
              return (
                <li key={r.personId} className={cn("px-4 py-3", isSent && "bg-emerald-50/30")}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">
                        {r.name || <span className="text-muted">Unnamed contact</span>}
                        {r.org && <span className="ml-2 text-[12px] font-normal text-muted">{r.org}</span>}
                        <span
                          title={ver.kind === "returning" ? "Already knows you — gets the thank-you version" : "New contact — gets the intro version"}
                          className={cn(
                            "ml-2 rounded-full px-1.5 py-0.5 align-middle text-[9.5px] font-bold uppercase tracking-wide",
                            ver.kind === "returning" ? "bg-emerald-50 text-emerald-700" : "bg-brand-50 text-brand-700",
                          )}
                        >
                          {ver.kind === "returning" ? "Returning" : "Intro"}
                        </span>
                      </p>
                      <p className="truncate text-[12px] text-subtle">{r.email || "No email on file"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => toggleExpand(r.personId)} className={miniBtn}>
                        <ChevronDown size={12} className={cn("transition-transform", isOpen && "rotate-180")} /> Preview
                      </button>
                      <label
                        className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold", (!r.email || isSent) ? "opacity-40" : "cursor-pointer hover:bg-elevated")}
                        title={!r.email ? "No email on file" : isSent ? "Already sent" : "Select for sending"}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-brand-600"
                          checked={picked.has(r.personId)}
                          disabled={!r.email || isSent}
                          onChange={() => togglePicked(r.personId)}
                        />
                        Select
                      </label>
                      <button type="button" onClick={() => copyEmail(r)} className={miniBtn}>
                        {copiedId === r.personId ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />} Copy
                      </button>
                      <a
                        href={r.email ? mailtoHref(r) : undefined}
                        aria-disabled={!r.email}
                        title={r.email ? "Open in your email client" : "No email on file"}
                        className={cn(miniBtn, !r.email && "pointer-events-none opacity-40")}
                      >
                        <Mail size={12} /> Email
                      </a>
                      <button
                        type="button"
                        onClick={() => toggleSent(r)}
                        disabled={!isSent && !r.email}
                        title={!isSent && !r.email ? "No email on file — add one before marking this contact emailed" : undefined}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          isSent ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-brand-600 text-white hover:bg-brand-700",
                        )}
                      >
                        {isSent ? <><MailCheck size={12} /> Reached</> : <><Check size={12} /> Mark reached</>}
                      </button>
                    </div>
                  </div>

                  {preview && (
                    <div className="mt-3 rounded-lg border border-line bg-elevated/30 p-3">
                      <p className="text-[12px] font-semibold text-fg">Subject: <span className="font-normal">{preview.subject}</span></p>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-2">{preview.body}</pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
