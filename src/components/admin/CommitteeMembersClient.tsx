"use client";
/**
 * Client surface for the /admin/committees page.
 *
 * Renders one section per committee with:
 *   • Add-member form (email + optional note).
 *   • Per-member row with a "Revoke" / "Reinstate" action and an
 *     inline note editor.
 *
 * All mutations hit /api/admin/committees[/id] and rely on
 * router.refresh() to re-pull the server-rendered list.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, RotateCcw, AlertCircle, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CommitteeMeta } from "@/lib/committees/registry";

interface Member {
  id: string;
  committee: string;
  active: boolean;
  note: string | null;
  joinedAt: string | Date;
  leftAt: string | Date | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    organization: string | null;
  };
}

interface Props {
  committees: CommitteeMeta[];
  grouped: Record<string, Member[]>;
}

export function CommitteeMembersClient({ committees, grouped }: Props) {
  return (
    <div className="space-y-8">
      {committees.map((c) => (
        <CommitteeSection
          key={c.slug}
          committee={c}
          members={grouped[c.slug] ?? []}
        />
      ))}
    </div>
  );
}

function CommitteeSection({
  committee,
  members,
}: {
  committee: CommitteeMeta;
  members: Member[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeMembers   = members.filter((m) => m.active);
  const inactiveMembers = members.filter((m) => !m.active);

  async function add() {
    setError(null);
    setSuccess(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email is required.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/committees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            committee: committee.slug,
            email: trimmed,
            note: note.trim() || undefined,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Failed to add member.");
        setEmail("");
        setNote("");
        setSuccess(`Added ${j.user?.name ?? j.user?.email ?? trimmed}.`);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-card p-5 surface-shadow">
      <header className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-fg">{committee.name}</h2>
            <Badge tone={committee.grantsEquipReview ? "success" : "brand"}>
              {committee.slug}
            </Badge>
          </div>
          <p className="text-sm text-muted mt-1 max-w-prose">
            {committee.description}
          </p>
          {committee.grantsEquipReview && (
            <p className="text-[11px] text-emerald-700 mt-2 inline-flex items-center gap-1.5">
              <AlertCircle size={11} />
              Members get /admin/equip access even without an admin role.
            </p>
          )}
        </div>
        <p className="text-[11px] text-subtle whitespace-nowrap">
          {activeMembers.length} active
          {inactiveMembers.length > 0 ? ` · ${inactiveMembers.length} past` : ""}
        </p>
      </header>

      {/* Add form */}
      <div className="rounded-xl bg-elevated/40 border border-line p-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@biohubnet.ca"
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-bold text-subtle">
              Note (optional)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why are they joining? Term length? Subcommittee?"
              className="mt-1 w-full bg-card-solid border border-line rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-xl"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add
          </button>
        </div>
        {error && (
          <p className="text-[11px] text-rose-700 inline-flex items-center gap-1.5 mt-2">
            <AlertCircle size={11} /> {error}
          </p>
        )}
        {success && (
          <p className="text-[11px] text-emerald-700 mt-2">{success}</p>
        )}
      </div>

      {/* Active members */}
      {activeMembers.length === 0 ? (
        <p className="text-sm text-subtle italic px-1">
          No active members yet. Add the first one above.
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-card-solid">
          {activeMembers.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </ul>
      )}

      {/* Past members */}
      {inactiveMembers.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-muted cursor-pointer hover:text-fg">
            Past members ({inactiveMembers.length})
          </summary>
          <ul className="mt-2 divide-y divide-line border border-line rounded-xl overflow-hidden bg-card-solid/60">
            {inactiveMembers.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function MemberRow({ member }: { member: Member }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(member.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  function mutate(payload: Record<string, unknown>, method: "PATCH" | "DELETE" = "PATCH") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/committees/${member.id}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "PATCH" ? JSON.stringify(payload) : undefined,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Action failed");
        }
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <li className={"px-4 py-3 " + (member.active ? "" : "opacity-60")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg truncate">
            {member.user.name ?? member.user.email}
          </p>
          <p className="text-xs text-subtle truncate">
            {member.user.email}
            {member.user.organization ? ` · ${member.user.organization}` : ""}
            <span className="ml-2 text-[10px] uppercase tracking-wider">{member.user.role}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[11px] text-subtle whitespace-nowrap">
            {member.active
              ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
              : `Left ${member.leftAt ? new Date(member.leftAt).toLocaleDateString() : "—"}`}
          </p>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-muted hover:text-fg inline-flex items-center gap-1"
              title="Edit note"
            >
              <Pencil size={11} />
            </button>
          )}
          {member.active ? (
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog({
                  title: `Revoke ${member.user.name ?? member.user.email} from this committee?`,
                  confirmLabel: "Revoke",
                  tone: "destructive",
                })) {
                  mutate({}, "DELETE");
                }
              }}
              disabled={pending}
              className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              Revoke
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mutate({ active: true })}
              disabled={pending}
              className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Reinstate
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="flex-1 bg-elevated/40 border border-line rounded-lg px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => mutate({ note })}
            disabled={pending}
            className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setNote(member.note ?? ""); }}
            className="text-xs text-muted hover:text-fg inline-flex items-center gap-1"
          >
            <X size={11} /> Cancel
          </button>
        </div>
      ) : member.note ? (
        <p className="text-xs text-muted mt-1 italic">“{member.note}”</p>
      ) : null}

      {error && (
        <p className="text-[11px] text-rose-700 mt-1 inline-flex items-center gap-1.5">
          <AlertCircle size={11} /> {error}
        </p>
      )}
      {confirmNode}
    </li>
  );
}
