"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface UserBasic { id: string; name: string | null; email: string }
interface CourseBasic { id: string; title: string }

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  _count: { members: number; courses: number };
  members: { user: UserBasic }[];
  courses: { course: CourseBasic }[];
}

export function GroupsClient({
  groups: initial,
  allUsers,
  allCourses,
}: {
  groups: GroupData[];
  allUsers: UserBasic[];
  allCourses: CourseBasic[];
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const { confirmDialog, node: confirmNode } = useConfirmDialog();

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc }),
    });
    const g = await res.json();
    setGroups((prev) => [{ ...g, _count: { members: 0, courses: 0 }, members: [], courses: [] }, ...prev]);
    setName(""); setDesc(""); setShowCreate(false);
    setLoading(false);
  }

  async function deleteGroup(id: string) {
    if (!(await confirmDialog({ title: "Delete this group?", confirmLabel: "Delete", tone: "destructive" }))) return;
    await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }

  async function addMembers(groupId: string, userIds: string[]) {
    if (userIds.length === 0) return;
    await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    });
    router.refresh();
  }

  async function removeMember(groupId: string, userId: string) {
    await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    router.refresh();
  }

  async function addCourse(groupId: string, courseId: string) {
    await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseIds: [courseId] }),
    });
    router.refresh();
  }

  async function removeCourse(groupId: string, courseId: string) {
    await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {confirmNode}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-brand-700"
        >
          + New Group
        </button>
      </div>

      {groups.map((group) => {
        const open = expanded === group.id;
        return (
          <div key={group.id} className="bg-card rounded-xl border border-line overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-elevated"
              onClick={() => setExpanded(open ? null : group.id)}
            >
              <div className="flex items-center gap-3">
                {open ? <ChevronDown size={16} className="text-subtle" /> : <ChevronRight size={16} className="text-subtle" />}
                <div>
                  <p className="font-semibold text-fg">{group.name}</p>
                  {group.description && <p className="text-xs text-subtle">{group.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted">{group._count.members} members</span>
                <span className="text-xs text-muted">{group._count.courses} courses</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}
                  className="text-subtle hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {open && (
              <div className="border-t border-line px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Members */}
                <div>
                  <p className="text-sm font-medium text-muted mb-2">
                    Members
                    <span className="ml-2 text-[11px] font-normal text-subtle">
                      a person can be in multiple groups
                    </span>
                  </p>
                  <MemberPicker
                    candidates={allUsers.filter(
                      (u) => !group.members.some((m) => m.user.id === u.id),
                    )}
                    onAdd={(ids) => addMembers(group.id, ids)}
                  />
                  <div className="mt-2 space-y-1">
                    {group.members.map((m) => (
                      <div key={m.user.id} className="flex items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-elevated">
                        <span className="min-w-0">
                          <span className="block truncate">{m.user.name ?? m.user.email}</span>
                          {m.user.name && (
                            <span className="block truncate text-[11px] text-subtle">{m.user.email}</span>
                          )}
                        </span>
                        <button onClick={() => removeMember(group.id, m.user.id)} className="text-subtle hover:text-red-400 shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {group.members.length === 0 && (
                      <p className="text-xs text-subtle px-2">No members yet.</p>
                    )}
                  </div>
                </div>

                {/* Courses */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted">Courses</p>
                    <AddSelect
                      placeholder="Add course…"
                      options={allCourses
                        .filter((c) => !group.courses.some((gc) => gc.course.id === c.id))
                        .map((c) => ({ value: c.id, label: c.title }))}
                      onAdd={(id) => addCourse(group.id, id)}
                    />
                  </div>
                  <div className="space-y-1">
                    {group.courses.map((gc) => (
                      <div key={gc.course.id} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-elevated">
                        <span>{gc.course.title}</span>
                        <button onClick={() => removeCourse(group.id, gc.course.id)} className="text-subtle hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {group.courses.length === 0 && (
                      <p className="text-xs text-subtle px-2">No courses assigned.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="text-center py-12 text-subtle">No groups yet. Create one to get started.</div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-fg mb-4">New Group</h3>
            <form onSubmit={createGroup} className="space-y-3">
              <input
                placeholder="Group name *"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description (optional)"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 border border-line rounded-lg py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSelect({
  placeholder,
  options,
  onAdd,
}: {
  placeholder: string;
  options: { value: string; label: string }[];
  onAdd: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) { onAdd(e.target.value); e.target.value = ""; }
        }}
        className="text-xs border border-line rounded px-2 py-1 bg-card max-w-[160px]"
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Plus size={12} className="text-subtle" />
    </div>
  );
}

/**
 * Searchable, multi-select picker for adding EXISTING people to a group.
 * Candidates are users not already in this group (a person can still be
 * in other groups — membership is per-group). Adds the whole selection
 * in one request.
 */
function MemberPicker({
  candidates,
  onAdd,
}: {
  candidates: UserBasic[];
  onAdd: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(
        (u) =>
          (u.name ?? "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    : candidates;
  const shown = filtered.slice(0, 50);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function cancel() {
    setOpen(false);
    setSelected(new Set());
    setQuery("");
  }
  async function confirmAdd() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    await onAdd([...selected]);
    setBusy(false);
    cancel();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1.5 text-xs font-medium text-fg hover:border-brand-400 hover:text-brand-700"
      >
        <Plus size={12} /> Add people
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-elevated/40 p-2">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or email…"
        className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand-400"
      />
      <div className="mt-1.5 max-h-52 overflow-y-auto rounded-md border border-line bg-card">
        {shown.length === 0 ? (
          <p className="px-3 py-3 text-center text-xs text-subtle">
            {candidates.length === 0
              ? "Everyone's already in this group."
              : "No matches."}
          </p>
        ) : (
          shown.map((u) => {
            const on = selected.has(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-elevated"
              >
                <span
                  className={[
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-line",
                  ].join(" ")}
                >
                  {on && <Check size={10} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-fg">
                    {u.name ?? u.email}
                  </span>
                  {u.name && (
                    <span className="block truncate text-[10.5px] text-subtle">
                      {u.email}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
        {filtered.length > shown.length && (
          <p className="px-3 py-1 text-[10.5px] text-subtle">
            Showing 50 of {filtered.length} — keep typing to narrow.
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button onClick={cancel} className="text-xs text-subtle hover:text-fg">
          Cancel
        </button>
        <button
          onClick={confirmAdd}
          disabled={selected.size === 0 || busy}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Adding…" : selected.size > 0 ? `Add ${selected.size}` : "Add"}
        </button>
      </div>
    </div>
  );
}
