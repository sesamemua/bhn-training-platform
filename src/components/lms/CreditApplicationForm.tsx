"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { getCampaignAttribution } from "@/lib/campaign/attribution-client";

const MAX_FILES = 5;
const MAX_SIZE_MB = 10;

export function CreditApplicationForm({ defaultName = "" }: { defaultName?: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [organization, setOrganization] = useState("");
  const [title, setTitle] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [useCase, setUseCase] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_SIZE_MB * 1024 * 1024);
    if (tooBig) {
      setError(`File "${tooBig.name}" is over ${MAX_SIZE_MB} MB.`);
      return;
    }
    const next = [...files, ...incoming].slice(0, MAX_FILES);
    setFiles(next);
    setError("");
  }

  function removeFile(idx: number) {
    setFiles((cur) => cur.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) return setError("Full name is required.");
    if (useCase.trim().length < 30) return setError("Please describe your use case in at least 30 characters.");
    if (files.length === 0) return setError("Attach at least one supporting document.");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("fullName", fullName.trim());
      fd.append("organization", organization);
      fd.append("title", title);
      fd.append("country", country);
      fd.append("phone", phone);
      fd.append("useCase", useCase.trim());
      fd.append("campaignAttribution", JSON.stringify(getCampaignAttribution()));
      for (const f of files) fd.append("documents", f);

      const res = await fetch("/api/credits/applications", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Submission failed");
        return;
      }
      router.push("/credits");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-fg">About you</h2>
          <p className="text-xs text-subtle mt-0.5">Used to verify identity and contact you about the application.</p>
        </div>
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Organization">
            <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Acme Bio Inc." />
          </Field>
          <Field label="Title or role">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Process Engineer" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 555 5555" />
          </Field>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-fg">Your learning goals</h2>
          <p className="text-xs text-subtle mt-0.5">
            Briefly tell us about your learning objective or career goal — what you&apos;re hoping
            BHN Training will help you achieve.
          </p>
        </div>
        <Field label="Tell us about your goals" required hint={`${useCase.trim().length}/30 characters minimum`}>
          <Textarea
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            rows={5}
            placeholder="e.g. I'm transitioning into upstream bioprocessing and want to build foundational skills in cell culture and aseptic technique to qualify for a manufacturing associate role."
          />
        </Field>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-fg">Supporting documents</h2>
          <p className="text-xs text-subtle mt-0.5">
            Up to {MAX_FILES} files, {MAX_SIZE_MB} MB each. Examples: employer letter, training authorization,
            ID, professional credential. Documents are visible only to the admin reviewer.
          </p>
        </div>

        <label className="block">
          <span className="sr-only">Choose files</span>
          <div className="border-2 border-dashed border-line-strong hover:border-brand-300 hover:bg-brand-50/30 rounded-xl px-4 py-8 text-center cursor-pointer transition-colors">
            <Upload size={20} className="mx-auto text-muted mb-2" />
            <p className="text-sm font-medium text-fg">Click to upload or drop files here</p>
            <p className="text-xs text-subtle mt-1">PDF, image, or Word document</p>
            <input
              type="file"
              multiple
              accept="application/pdf,image/*,.doc,.docx"
              onChange={(e) => pickFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </label>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 bg-elevated rounded-lg px-3 py-2 text-sm">
                <FileText size={16} className="text-muted shrink-0" />
                <span className="flex-1 truncate text-fg">{f.name}</span>
                <span className="text-xs text-subtle">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-subtle hover:text-rose-600 p-0.5"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" loading={submitting}>Submit application</Button>
      </div>
    </form>
  );
}
