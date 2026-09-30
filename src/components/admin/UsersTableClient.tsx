"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare, Square, MinusSquare, X,
  ShieldCheck, ShieldOff, Coins, UserCheck, UsersRound, Loader2, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { UserRowClient } from "./UserRowClient";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
  credits: number;
  createdAt: Date;
  lastLoginAt: Date | null;
  _count: { enrollments: number; certificates: number };
}

interface GroupOption {
  id: string;
  name: string;
}

interface Props {
  users: UserRow[];
  groups: GroupOption[];
  /** Active account-kind tab. Batch delete is only offered for non-real test accounts. */
  kind: string;
  /** Seeds the filter box — set when arriving via the admin global search
   *  (/admin/users?q=...) so the deep link lands already filtered. */
  initialQuery?: string;
}

const ROLES = ["trainee", "evaluating", "employer", "hr", "industrial_mentor", "instructor", "admin", "superadmin"];

/** Coarse role buckets for the classification chips above the table.
 *  Every role maps to exactly one bucket so the counts always sum to the
 *  full list. "Other" catches employer / mentor / instructor / the two
 *  committee seats — anything that isn't a platform admin, internal HR,
 *  or a learner (trainee/evaluating). */
type RoleGroup = "all" | "admins" | "instructors" | "hr" | "trainees" | "other";
function roleGroupOf(role: string): Exclude<RoleGroup, "all"> {
  if (role === "admin" || role === "superadmin") return "admins";
  if (role === "instructor") return "instructors";
  if (role === "hr") return "hr";
  if (role === "trainee" || role === "evaluating") return "trainees";
  return "other";
}
const ROLE_GROUP_TABS: { key: RoleGroup; label: string }[] = [
  { key: "all", label: "All" },
  { key: "admins", label: "Admins" },
  { key: "instructors", label: "Instructors" },
  { key: "hr", label: "HR" },
  { key: "trainees", label: "Trainees" },
  { key: "other", label: "Other" },
];

export function UsersTableClient({ users, groups, kind, initialQuery }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState(initialQuery ?? "");
  const [roleGroup, setRoleGroup] = useState<RoleGroup>("all");
  const [modal, setModal] = useState<null | "role" | "credits" | "group" | "delete">(null);
  const [pendingRole, setPendingRole] = useState("trainee");
  const [pendingAmount, setPendingAmount] = useState("100");
  const [pendingGroup, setPendingGroup] = useState(groups[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  // Batch hard-delete is destructive — only surfaced for non-real test accounts.
  const canBatchDelete = kind !== "real";

  const visible = useMemo(() => {
    let list =
      roleGroup === "all"
        ? users
        : users.filter((u) => roleGroupOf(u.role) === roleGroup);
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.name?.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, filter, roleGroup]);

  // Per-bucket counts for the classification chips — computed from the
  // full (unfiltered) set so each chip shows the true size of its group.
  const groupCounts = useMemo(() => {
    const c: Record<RoleGroup, number> = {
      all: users.length,
      admins: 0,
      instructors: 0,
      hr: 0,
      trainees: 0,
      other: 0,
    };
    for (const u of users) c[roleGroupOf(u.role)]++;
    return c;
  }, [users]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((u) => selected.has(u.id));
  const someVisibleSelected =
    !allVisibleSelected && visible.some((u) => selected.has(u.id));

  function toggleAll() {
    setSelected((cur) => {
      const next = new Set(cur);
      if (allVisibleSelected) {
        for (const u of visible) next.delete(u.id);
      } else {
        for (const u of visible) next.add(u.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function batch(
    action: "activate" | "deactivate" | "setRole" | "grantCredits" | "addToGroup" | "delete",
    payload?: Record<string, unknown>
  ) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected), action, payload }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; affected?: number; failed?: number };
      if (!res.ok) {
        await confirmDialog({ title: j.error ?? "Batch action failed", acknowledgeOnly: true });
        return;
      }
      if (action === "delete" && (j.failed ?? 0) > 0) {
        await confirmDialog({
          title: `Deleted ${j.affected ?? 0}. ${j.failed} couldn't be removed.`,
          description: "They still have linked records that block deletion.",
          acknowledgeOnly: true,
        });
      }
      setModal(null);
      clearSelection();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Role classification — bucket the current account-kind view by
          role group. Counts come from the full set; clicking filters. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          Group
        </span>
        {ROLE_GROUP_TABS.filter(
          (t) => t.key !== "other" || groupCounts.other > 0
        ).map((t) => {
          const active = roleGroup === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setRoleGroup(t.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-line bg-card text-muted hover:border-brand-300 hover:text-fg"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "tabular-nums text-[11px]",
                  active ? "text-brand-50" : "text-subtle"
                )}
              >
                {groupCounts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Filter by name, email, or role…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-xs text-subtle">
          {visible.length} of {users.length} shown
          {selected.size > 0 ? ` · ${selected.size} selected` : ""}
        </p>
      </div>

      {/* Sticky batch action bar — appears when any user is selected */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 bg-brand-600 text-white rounded-2xl shadow-xl shadow-brand-900/20 px-4 py-2.5 animate-fade-in">
          <div className="flex items-center gap-2 mr-2">
            <UsersRound size={16} />
            <span className="text-sm font-semibold">{selected.size}</span>
            <span className="text-xs text-brand-100">selected</span>
          </div>
          <span className="h-5 w-px bg-white/20" />
          <button
            onClick={() => batch("activate")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5"
          >
            <ShieldCheck size={13} /> Activate
          </button>
          <button
            onClick={() => batch("deactivate")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5"
          >
            <ShieldOff size={13} /> Deactivate
          </button>
          <button
            onClick={() => setModal("role")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5"
          >
            <UserCheck size={13} /> Change role
          </button>
          <button
            onClick={() => setModal("credits")}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5"
          >
            <Coins size={13} /> Adjust credits
          </button>
          {groups.length > 0 && (
            <button
              onClick={() => setModal("group")}
              disabled={busy}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-1.5"
            >
              <UsersRound size={13} /> Add to group
            </button>
          )}
          {canBatchDelete && (
            <button
              onClick={() => setModal("delete")}
              disabled={busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
          <span className="ml-auto" />
          {busy && <Loader2 size={14} className="animate-spin" />}
          <button
            onClick={clearSelection}
            className="text-xs px-2 py-1 rounded-lg hover:bg-white/15 transition-colors flex items-center gap-1"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-4 py-3 w-10">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center text-muted hover:text-brand-600 transition-colors"
                    aria-label={allVisibleSelected ? "Deselect all" : "Select all"}
                  >
                    {allVisibleSelected ? (
                      <CheckSquare size={16} className="text-brand-600" />
                    ) : someVisibleSelected ? (
                      <MinusSquare size={16} className="text-brand-600" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Credits</th>
                <th className="px-5 py-3">Enrolls</th>
                <th className="px-5 py-3">Certs</th>
                <th className="px-5 py-3">Last Login</th>
                <th className="px-5 py-3">Joined</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((user) => {
                const isSelected = selected.has(user.id);
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      "hover:bg-elevated/60 transition-colors",
                      !user.isActive && "opacity-50",
                      isSelected && "bg-brand-50/60"
                    )}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleOne(user.id)}
                        className="flex items-center text-muted hover:text-brand-600 transition-colors"
                        aria-label={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-brand-600" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-fg">{user.name ?? "—"}</p>
                      <p className="text-xs text-subtle">{user.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        user.role === "superadmin" ? "bg-rose-100 text-rose-700" :
                        user.role === "admin" ? "bg-brand-100 text-brand-700" :
                        user.role === "hr" ? "bg-sky-100 text-sky-700" :
                        user.role === "instructor" ? "bg-violet-100 text-violet-700" :
                        user.role === "evaluating" ? "bg-amber-100 text-amber-700" :
                        "bg-elevated text-muted"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                      )}>
                        {user.isActive ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted font-mono text-xs">
                      {user.credits.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-muted">{user._count.enrollments}</td>
                    <td className="px-5 py-3 text-muted">{user._count.certificates}</td>
                    <td className="px-5 py-3 text-subtle text-xs">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3 text-subtle text-xs">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <UserRowClient user={user} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <Modal
        open={modal === "role"}
        onClose={() => setModal(null)}
        size="sm"
        title={`Change role for ${selected.size} user${selected.size === 1 ? "" : "s"}`}
        description="The new role applies to every selected user."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={() => batch("setRole", { role: pendingRole })} loading={busy}>
              Apply role
            </Button>
          </>
        }
      >
        <Field label="New role">
          <Select value={pendingRole} onChange={(e) => setPendingRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={modal === "credits"}
        onClose={() => setModal(null)}
        size="sm"
        title={`Adjust credits for ${selected.size} user${selected.size === 1 ? "" : "s"}`}
        description="Use a negative number to debit. The change is logged in the credit transaction history."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={() => batch("grantCredits", { amount: Number(pendingAmount) })}
              loading={busy}
            >
              {Number(pendingAmount) >= 0 ? "Grant" : "Debit"}
            </Button>
          </>
        }
      >
        <Field label="Amount" hint="Positive grants, negative debits.">
          <Input
            type="number"
            value={pendingAmount}
            onChange={(e) => setPendingAmount(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={modal === "group"}
        onClose={() => setModal(null)}
        size="sm"
        title={`Add ${selected.size} user${selected.size === 1 ? "" : "s"} to a group`}
        description="Existing memberships are preserved — duplicates skipped."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={() => batch("addToGroup", { groupId: pendingGroup })}
              loading={busy}
              disabled={!pendingGroup}
            >
              Add to group
            </Button>
          </>
        }
      >
        <Field label="Group">
          <Select value={pendingGroup} onChange={(e) => setPendingGroup(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={modal === "delete"}
        onClose={() => setModal(null)}
        size="sm"
        title={`Delete ${selected.size} ${kind} user${selected.size === 1 ? "" : "s"}?`}
        description="This permanently removes the selected accounts and everything that belongs to them — enrollments, certificates, submissions, and more. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => batch("delete")} loading={busy}>
              Delete {selected.size} user{selected.size === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 text-xs">
          Safety: real accounts are never removed here — only non-real test accounts
          (<span className="font-semibold">{kind}</span>) in your selection are deleted. Your own
          account and any superadmins are skipped automatically.
        </div>
      </Modal>
      {confirmNode}
    </div>
  );
}
