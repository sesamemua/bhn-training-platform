"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";

interface CourseShape {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  passingScore: number;
  maxAttempts: number;
  duration: number | null;
  creditCost: number;
  thumbnail: string | null;
  requiresApproval?: boolean;
}

export function CourseEditButton({ course }: { course: CourseShape }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [category, setCategory] = useState(course.category ?? "");
  const [status, setStatus] = useState(course.status);
  const [passingScore, setPassingScore] = useState(String(course.passingScore));
  const [maxAttempts, setMaxAttempts] = useState(String(course.maxAttempts));
  const [duration, setDuration] = useState(course.duration != null ? String(course.duration) : "");
  const [creditCost, setCreditCost] = useState(String(course.creditCost));
  const [thumbnail, setThumbnail] = useState(course.thumbnail ?? "");
  const [requiresApproval, setRequiresApproval] = useState(course.requiresApproval ?? false);

  async function hardDelete() {
    if (deleteConfirm !== course.title) {
      setError("Type the exact course title to confirm.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Delete failed");
        return;
      }
      // Send the admin back to the catalog — the detail page they're
      // on no longer exists.
      router.push("/courses");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          status,
          passingScore: Number(passingScore) || 0,
          maxAttempts: Number(maxAttempts) || 0,
          duration: duration ? Number(duration) : null,
          creditCost: Number(creditCost) || 0,
          thumbnail: thumbnail.trim() || null,
          requiresApproval,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Save failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} size="sm">
        <Pencil size={14} /> Edit
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setShowDelete(false); setDeleteConfirm(""); setError(null); }}
        size="lg"
        title="Edit course"
        description="Changes apply immediately. Existing enrollments are preserved. To stop new enrollments without deleting, set status to Archived — the course stays visible in the catalog but enrolment is closed."
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowDelete((v) => !v)}
              className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 px-2 py-1 rounded"
            >
              <Trash2 size={11} /> {showDelete ? "Cancel delete" : "Delete course…"}
            </button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={loading}>Save changes</Button>
          </>
        }
      >
        {error && (
          <div role="alert" className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-4 py-2 mb-4 text-sm text-rose-900">
            {error}
          </div>
        )}
        {showDelete && (
          <div className="rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200 px-4 py-3 mb-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-rose-700 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm text-rose-900 leading-snug">
                <p className="font-bold">Delete this course permanently?</p>
                <p className="text-xs mt-1">
                  This removes the course, all its modules, assessments,
                  SCORM package, and <strong>every enrolment + certificate</strong>{" "}
                  ever issued for it. Cannot be undone. If you only want to
                  stop new enrolments while preserving records, set status
                  to <strong>Archived</strong> above instead — archived
                  courses stay in the catalog with a disabled enroll button.
                </p>
              </div>
            </div>
            <Field label={<>Type the course title <code className="font-mono text-fg">{course.title}</code> to confirm</>}>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={course.title}
                disabled={deleting}
              />
            </Field>
            <div>
              <Button
                onClick={hardDelete}
                loading={deleting}
                disabled={deleting || deleteConfirm !== course.title}
                variant="danger"
              >
                <Trash2 size={12} /> Delete course permanently
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Cleanroom" />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Passing score (%)">
              <Input type="number" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(e.target.value)} />
            </Field>
            <Field label="Max attempts" hint="0 = unlimited">
              <Input type="number" min="0" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
            </Field>
            <Field label="Duration (min)">
              <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Credit cost (BHN)">
              <Input type="number" min="0" value={creditCost} onChange={(e) => setCreditCost(e.target.value)} />
            </Field>
            <Field label="Thumbnail URL">
              <Input value={thumbnail} onChange={(e) => setThumbnail(e.target.value)} placeholder="https://…" />
            </Field>
          </div>

          {/* Approval gate — opt this course into the same admin-review
              flow that pathways already use. When on, the user-facing
              enrol creates a Pending row (instead of Active) and skips
              the credit deduction; the deduction happens on approval. */}
          <label className="flex items-start gap-3 rounded-xl border border-line bg-background p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="mt-0.5 accent-brand-600 w-4 h-4"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-fg">
                Require admin approval to enrol
              </span>
              <span className="block text-xs text-muted leading-snug mt-0.5">
                Trainee clicks Enrol → status is set to <strong>Pending</strong> and the
                request lands on the admin queue at <code className="font-mono text-fg">/admin/enrollments</code>.
                Credits are charged only on approval, so a rejected request costs nothing.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
