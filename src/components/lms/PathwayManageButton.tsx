"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, GripVertical, X, Trash2, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface CourseOption {
  id: string;
  title: string;
  category: string | null;
}

interface PathwayShape {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  courseIds: string[];
}

interface Props {
  mode: "create" | "edit";
  pathway?: PathwayShape;
  courses: CourseOption[];
}

const MIME = "application/x-bhn-pathway-course";

export function PathwayManageButton({ mode, pathway, courses }: Props) {
  const router = useRouter();
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState(pathway?.title ?? "");
  const [description, setDescription] = useState(pathway?.description ?? "");
  const [category, setCategory] = useState(pathway?.category ?? "");
  const [status, setStatus] = useState(pathway?.status ?? "draft");
  const [selectedIds, setSelectedIds] = useState<string[]>(pathway?.courseIds ?? []);
  const [filter, setFilter] = useState("");

  // Drag tracking
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOriginIsList, setDragOriginIsList] = useState(false);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [dustbinHover, setDustbinHover] = useState(false);
  const [pickerHover, setPickerHover] = useState(false);
  const dragSourceRef = useRef<"list" | "picker" | null>(null);

  function toggle(id: string) {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  }
  function removeId(id: string) {
    setSelectedIds((cur) => cur.filter((c) => c !== id));
  }
  function addId(id: string) {
    setSelectedIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }
  function moveTo(id: string, targetIdx: number) {
    setSelectedIds((cur) => {
      const without = cur.filter((c) => c !== id);
      const idx = Math.min(targetIdx, without.length);
      return [...without.slice(0, idx), id, ...without.slice(idx)];
    });
  }

  // ── Drag handlers ──────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string, source: "list" | "picker") {
    e.dataTransfer.setData(MIME, id);
    e.dataTransfer.effectAllowed = source === "list" ? "move" : "copy";
    dragSourceRef.current = source;
    setDragId(id);
    setDragOriginIsList(source === "list");
  }
  function onDragEnd() {
    setDragId(null);
    setDropIdx(null);
    setDustbinHover(false);
    setPickerHover(false);
    dragSourceRef.current = null;
    setDragOriginIsList(false);
  }
  function onListDragOver(e: React.DragEvent, idx: number) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragOriginIsList ? "move" : "copy";
    setDropIdx(idx);
  }
  function onListDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const id = e.dataTransfer.getData(MIME);
    if (!id) return;
    if (dragOriginIsList) {
      // reorder
      moveTo(id, idx);
    } else {
      // add from picker into specific position
      setSelectedIds((cur) => {
        if (cur.includes(id)) return cur;
        return [...cur.slice(0, idx), id, ...cur.slice(idx)];
      });
    }
    onDragEnd();
  }
  function onListEndDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData(MIME);
    if (!id) return;
    if (dragOriginIsList) moveTo(id, selectedIds.length);
    else addId(id);
    onDragEnd();
  }
  function onDustbinDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData(MIME);
    if (id) removeId(id);
    onDragEnd();
  }
  function onPickerDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData(MIME);
    // Dropping a list-item back on the picker = remove from selected
    if (id && dragOriginIsList) removeId(id);
    onDragEnd();
  }

  async function submit() {
    if (!title.trim()) {
      await confirmDialog({ title: "Title is required", acknowledgeOnly: true });
      return;
    }
    setLoading(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        status,
        courseIds: selectedIds,
      };
      const url = mode === "create" ? "/api/pathways" : `/api/pathways/${pathway!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        await confirmDialog({ title: j.error ?? "Save failed", acknowledgeOnly: true });
        return;
      }
      const data = await res.json();
      setOpen(false);
      if (mode === "create") router.push(`/pathways/${data.id}`);
      else router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!pathway) return;
    if (!(await confirmDialog({
      title: "Delete this pathway?",
      description: "Existing certificates remain but no new ones will issue.",
      confirmLabel: "Delete",
      tone: "destructive",
    }))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/pathways/${pathway.id}`, { method: "DELETE" });
      if (!res.ok) {
        await confirmDialog({ title: "Delete failed", acknowledgeOnly: true });
        return;
      }
      router.push("/pathways");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = courses.filter(
    (c) => filter === "" || c.title.toLowerCase().includes(filter.toLowerCase())
  );
  const ordered = selectedIds
    .map((id) => courses.find((c) => c.id === id))
    .filter(Boolean) as CourseOption[];

  return (
    <>
      {confirmNode}
      {mode === "create" ? (
        <Button onClick={() => setOpen(true)} variant="primary">
          <Plus size={14} /> New pathway
        </Button>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          variant="secondary"
          className="bg-white text-brand-700 border-transparent hover:bg-brand-50 shadow-sm font-semibold"
        >
          <Pencil size={14} /> Edit pathway
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        resizable
        title={mode === "create" ? "Create training pathway" : "Edit training pathway"}
        description="Drag the title bar to move · drag the corner to resize. Drag courses from the right into the ordered list."
        footer={
          <>
            {mode === "edit" && (
              <Button variant="danger" onClick={remove} loading={deleting} className="mr-auto">
                <Trash2 size={14} /> Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={loading}>
              {mode === "create" ? "Create pathway" : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: metadata + ordered list */}
          <div className="space-y-4">
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Aseptic Operator Certification" />
            </Field>
            <Field label="Description" hint="Shown on the pathway detail page.">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What learners will master by completing this pathway." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Cleanroom" />
              </Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </Select>
              </Field>
            </div>

            {/* Ordered list — drop target */}
            <Field label={`Course order · ${ordered.length} selected`}>
              <ol
                className={cn(
                  "min-h-[120px] rounded-xl border-2 border-dashed border-line p-2 space-y-1.5 transition-colors",
                  dragId && !dragOriginIsList && "border-brand-300 bg-brand-50/40",
                )}
                onDragOver={(e) => { if (dragId && !dragOriginIsList) { e.preventDefault(); } }}
                onDrop={onListEndDrop}
              >
                {ordered.length === 0 ? (
                  <div className="text-xs text-subtle px-3 py-4 text-center">
                    Drag courses here from the picker on the right.
                  </div>
                ) : (
                  ordered.map((c, i) => {
                    const isDragging = dragId === c.id && dragOriginIsList;
                    const isDropTarget = dropIdx === i && dragId !== c.id;
                    return (
                      <li
                        key={c.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, c.id, "list")}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => onListDragOver(e, i)}
                        onDrop={(e) => onListDrop(e, i)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm group cursor-grab active:cursor-grabbing transition-all",
                          isDragging
                            ? "opacity-30 bg-elevated"
                            : "bg-elevated hover:bg-raised",
                          isDropTarget && "ring-2 ring-brand-400 -translate-y-0.5"
                        )}
                      >
                        <GripVertical size={14} className="text-subtle" />
                        <span className="text-xs text-subtle font-mono w-5 text-center">{i + 1}</span>
                        <span className="flex-1 truncate text-fg">{c.title}</span>
                        <button
                          type="button"
                          onClick={() => removeId(c.id)}
                          className="text-subtle hover:text-rose-600 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove"
                        >
                          <X size={12} />
                        </button>
                      </li>
                    );
                  })
                )}
                {/* End-of-list drop indicator */}
                {dragId && dragOriginIsList && dropIdx === null && ordered.length > 0 && (
                  <div className="h-1 bg-brand-300 rounded-full" />
                )}
              </ol>
            </Field>

            {/* Dustbin */}
            <div
              onDragOver={(e) => { if (dragId && dragOriginIsList) { e.preventDefault(); setDustbinHover(true); } }}
              onDragLeave={() => setDustbinHover(false)}
              onDrop={onDustbinDrop}
              className={cn(
                "rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 px-4 py-3 text-xs",
                dragId && dragOriginIsList
                  ? dustbinHover
                    ? "border-rose-400 bg-rose-50 text-rose-700 scale-[1.02]"
                    : "border-rose-200 bg-rose-50/50 text-rose-600"
                  : "border-line text-subtle"
              )}
            >
              <Trash2 size={14} />
              {dragId && dragOriginIsList
                ? "Drop here to remove from pathway"
                : "Drag a list item here to remove"}
            </div>
          </div>

          {/* Right: course picker — also a drop target for "remove" */}
          <div
            className={cn(
              "space-y-2 md:border-l md:pl-6 md:border-line transition-colors",
              dragId && dragOriginIsList && pickerHover && "bg-rose-50/50 -mx-2 px-2 rounded-xl",
            )}
            onDragOver={(e) => { if (dragId && dragOriginIsList) { e.preventDefault(); setPickerHover(true); } }}
            onDragLeave={() => setPickerHover(false)}
            onDrop={onPickerDrop}
          >
            <Field label="Add courses" hint={`${courses.length} courses in catalog · drag into the list`}>
              <Input
                placeholder="Filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </Field>
            <div className="max-h-[60vh] min-h-[300px] overflow-y-auto rounded-lg border border-line divide-y divide-line bg-card">
              {filtered.length === 0 && (
                <div className="text-xs text-subtle p-4 text-center">No courses match.</div>
              )}
              {filtered.map((c) => {
                const checked = selectedIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    draggable={!checked}
                    onDragStart={(e) => onDragStart(e, c.id, "picker")}
                    onDragEnd={onDragEnd}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 hover:bg-elevated transition-colors",
                      checked ? "bg-brand-50/50 cursor-default" : "cursor-grab active:cursor-grabbing"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                      className="accent-brand-600 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-fg truncate">{c.title}</p>
                      {c.category && <p className="text-xs text-subtle">{c.category}</p>}
                    </div>
                    {!checked && (
                      <ArrowRight size={12} className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    {checked && (
                      <span className="text-[10px] text-brand-700 font-semibold">In pathway</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
