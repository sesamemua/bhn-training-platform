"use client";

/**
 * Name, email, and into a public EQUIP form.
 *
 * The two fields exist because the application has to be addressable:
 * there is no account, so the link returned here is the only way back
 * into it, and it has to be sendable somewhere.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import type { EquipStream } from "@/lib/equip/types";
import { appendCampaignAttribution } from "@/lib/campaign/attribution";
import { getCampaignAttribution } from "@/lib/campaign/attribution-client";

interface Props {
  stream?: Extract<EquipStream, "venture_connect" | "innovation_fellowship">;
  destination?: string;
}

export function PublicEquipStart({
  stream = "venture_connect",
  destination = "/apply/venture-connect",
}: Props = {}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const campaignAttribution = getCampaignAttribution();
      const r = await fetch("/api/public/equip/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, stream, campaignAttribution }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "Couldn't start the application."); return; }
      router.push(appendCampaignAttribution(`${destination}/${j.token}`, campaignAttribution));
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-brand-500";

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Your full name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${input} mt-1.5`}
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && email.trim()) void start(); }}
            className={`${input} mt-1.5`}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        We use the address to identify your application, send your submission receipt,
        and reply about it.
      </p>
      {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
      <button
        onClick={start}
        disabled={busy || name.trim().length < 2 || !email.trim()}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
        Start the application <ArrowRight size={14} />
      </button>
    </div>
  );
}
