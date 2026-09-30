"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { User as UserIcon, Lock, ShieldQuestion, Save, Check, AlertCircle, Clock, X, Shield, Download, Languages, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { LOCALES, type LocaleId } from "@/lib/i18n/dictionaries";
import { useConsent } from "@/components/consent/ConsentProvider";
import { DemoFiller } from "@/components/demo/DemoFiller";
import { TRAINEE_PROFILE_PRESETS } from "@/lib/demo/presets";

interface UserShape {
  id: string;
  name: string | null;
  email: string;
  role: string;
  credits: number;
  phone: string | null;
  bio: string | null;
  organization: string | null;
  jobTitle: string | null;
  country: string | null;
  createdAt: Date;
}

interface RoleReq {
  id: string;
  fromRole: string;
  toRole: string;
  status: string;
  reason: string | null;
  reviewerNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

const ROLE_TARGETS: { id: string; label: string; description: string }[] = [
  { id: "evaluating", label: "Evaluating",  description: "Trial-tier learner with extended access" },
  { id: "instructor", label: "Instructor", description: "Author courses, modules, and assessments" },
  { id: "admin",      label: "Admin",      description: "Full platform administration (superadmin approval required)" },
];

export function ProfileClient({ user, latestRoleRequest }: {
  user: UserShape;
  latestRoleRequest: RoleReq | null;
}) {
  const router = useRouter();

  // ─── Profile info ───
  const [info, setInfo] = useState({
    name: user.name ?? "",
    email: user.email,
    phone: user.phone ?? "",
    organization: user.organization ?? "",
    jobTitle: user.jobTitle ?? "",
    country: user.country ?? "",
    bio: user.bio ?? "",
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoOk, setInfoOk] = useState(false);
  const [infoErr, setInfoErr] = useState("");

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSavingInfo(true);
    setInfoOk(false);
    setInfoErr("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setInfoErr(j.error ?? "Save failed");
        return;
      }
      setInfoOk(true);
      setTimeout(() => setInfoOk(false), 2200);
      router.refresh();
    } finally {
      setSavingInfo(false);
    }
  }

  // ─── Password ───
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwOk, setPwOk] = useState(false);
  const [pwErr, setPwErr] = useState("");

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr("");
    setPwOk(false);
    if (pw.next.length < 8) return setPwErr("New password must be at least 8 characters.");
    if (pw.next !== pw.confirm) return setPwErr("Confirmation doesn't match.");
    setSavingPw(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setPwErr(j.error ?? "Couldn't change password");
        return;
      }
      setPwOk(true);
      setPw({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwOk(false), 2500);
    } finally {
      setSavingPw(false);
    }
  }

  // ─── Role change ───
  const [target, setTarget] = useState(ROLE_TARGETS.find((r) => r.id !== user.role)?.id ?? "evaluating");
  const [reason, setReason] = useState("");
  const [submittingRole, setSubmittingRole] = useState(false);
  const [roleErr, setRoleErr] = useState("");

  const canSubmitNew = !latestRoleRequest || latestRoleRequest.status !== "pending";

  async function submitRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleErr("");
    if (!reason.trim()) return setRoleErr("Please share a quick reason for your request.");
    setSubmittingRole(true);
    try {
      const res = await fetch("/api/profile/role-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toRole: target, reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setRoleErr(j.error ?? "Couldn't submit request");
        return;
      }
      setReason("");
      router.refresh();
    } finally {
      setSubmittingRole(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile snapshot */}
      <Card className="p-5 flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-xl font-bold shadow-md shadow-brand-600/20 shrink-0">
          {(user.name || user.email)[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-fg truncate">{user.name ?? user.email}</h2>
            <Badge tone={
              user.role === "superadmin" ? "danger" :
              user.role === "admin"      ? "brand"  :
              user.role === "instructor" ? "warning" :
              "neutral"
            }>{user.role}</Badge>
          </div>
          <p className="text-sm text-muted truncate">{user.email}</p>
          <p className="text-xs text-subtle mt-1">
            {user.credits.toLocaleString()} credits · joined {new Date(user.createdAt).toLocaleDateString()}
          </p>
        </div>
      </Card>

      {/* Info */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <UserIcon size={18} className="text-brand-600" />
            <h3 className="font-semibold text-fg">Personal info</h3>
          </div>
          <DemoFiller
            visible={true}
            presets={TRAINEE_PROFILE_PRESETS}
            onFill={(preset) => {
              setInfo((cur) => ({
                ...cur,
                ...(preset.name !== undefined         ? { name: preset.name } : {}),
                ...(preset.bio !== undefined          ? { bio: preset.bio } : {}),
                ...(preset.organization !== undefined ? { organization: preset.organization } : {}),
                ...(preset.jobTitle !== undefined     ? { jobTitle: preset.jobTitle } : {}),
                ...(preset.country !== undefined      ? { country: preset.country } : {}),
              }));
            }}
            hint="trainee profile sample"
          />
        </div>
        <form onSubmit={saveInfo} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name">
              <Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
            </Field>
            <Field label="Email" hint="Must be unique on the platform.">
              <Input type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Organization">
              <Input value={info.organization} onChange={(e) => setInfo({ ...info, organization: e.target.value })} />
            </Field>
            <Field label="Job title">
              <Input value={info.jobTitle} onChange={(e) => setInfo({ ...info, jobTitle: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <Input value={info.country} onChange={(e) => setInfo({ ...info, country: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="About you" hint="Optional. A short bio shown on your profile.">
            <Textarea value={info.bio} onChange={(e) => setInfo({ ...info, bio: e.target.value })} rows={3} />
          </Field>

          {infoErr && <Alert tone="danger">{infoErr}</Alert>}
          {infoOk && <Alert tone="success">Saved.</Alert>}

          <div className="flex justify-end">
            <Button type="submit" loading={savingInfo}>
              <Save size={14} /> Save changes
            </Button>
          </div>
        </form>
      </Card>

      {/* Password */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-brand-600" />
            <h3 className="font-semibold text-fg">Password</h3>
          </div>
          <a
            href="/profile/security"
            className="text-xs text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1"
          >
            Multi-factor authentication →
          </a>
        </div>
        <form onSubmit={savePassword} className="space-y-4">
          <Field label="Current password" required>
            <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="New password" required hint="At least 8 characters.">
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" required>
              <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
          {pwErr && <Alert tone="danger">{pwErr}</Alert>}
          {pwOk && <Alert tone="success">Password updated.</Alert>}
          <div className="flex justify-end">
            <Button type="submit" loading={savingPw}>Update password</Button>
          </div>
        </form>
      </Card>

      {/* Language */}
      <LanguageSection />

      {/* Privacy & data — GDPR/CCPA controls */}
      <PrivacySection />

      {/* Role change */}
      {user.role !== "superadmin" && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldQuestion size={18} className="text-brand-600" />
            <h3 className="font-semibold text-fg">Request a role change</h3>
          </div>
          <p className="text-xs text-muted mb-4">
            Pick a role you&apos;d like to switch to and an admin will review. Admin-tier requests
            require superadmin approval.
          </p>

          {/* Latest request status */}
          {latestRoleRequest && (
            <RoleRequestStatusCard req={latestRoleRequest} className="mb-4" />
          )}

          {canSubmitNew && (
            <form onSubmit={submitRole} className="space-y-3">
              <Field label="Requested role" required>
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {ROLE_TARGETS
                    .filter((t) => t.id !== user.role)
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.label} — {t.description}</option>
                    ))}
                </Select>
              </Field>
              <Field label="Why" required hint="A few sentences. Admins read this before deciding.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </Field>
              {roleErr && <Alert tone="danger">{roleErr}</Alert>}
              <div className="flex justify-end">
                <Button type="submit" loading={submittingRole}>Submit request</Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}

function RoleRequestStatusCard({ req, className }: { req: RoleReq; className?: string }) {
  const tone =
    req.status === "approved" ? "success" as const :
    req.status === "rejected" ? "danger"  as const :
                                "amber"   as const;
  const Icon =
    req.status === "approved" ? Check :
    req.status === "rejected" ? X :
                                Clock;
  const bg =
    req.status === "approved" ? "bg-emerald-50 border-emerald-200" :
    req.status === "rejected" ? "bg-rose-50 border-rose-200" :
                                "bg-amber-50 border-amber-200";
  return (
    <div className={`border rounded-xl p-4 flex items-start gap-3 ${bg} ${className ?? ""}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 ${
        req.status === "approved" ? "bg-emerald-500" :
        req.status === "rejected" ? "bg-rose-500" :
                                    "bg-amber-500"
      }`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-2">
          <p className="font-semibold text-fg text-sm">
            {req.fromRole} → {req.toRole}
          </p>
          <Badge tone={tone}>{req.status}</Badge>
        </div>
        <p className="text-xs text-muted mt-0.5">
          Submitted {new Date(req.createdAt).toLocaleDateString()}
          {req.reviewedAt && ` · Reviewed ${new Date(req.reviewedAt).toLocaleDateString()}`}
        </p>
        {req.reason && (
          <p className="text-sm text-muted mt-2 leading-relaxed">{req.reason}</p>
        )}
        {req.reviewerNote && (
          <p className="text-sm text-fg mt-2 bg-card border border-line rounded-lg px-3 py-2 leading-relaxed">
            <span className="block text-[10px] font-semibold text-subtle uppercase tracking-[0.16em] mb-1">Reviewer note</span>
            {req.reviewerNote}
          </p>
        )}
      </div>
    </div>
  );
}

function Alert({ children, tone }: { children: React.ReactNode; tone: "success" | "danger" }) {
  return (
    <div className={
      "text-sm rounded-lg px-3 py-2 flex items-start gap-2 " +
      (tone === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700")
    }>
      {tone === "success" ? <Check size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
      <span>{children}</span>
    </div>
  );
}

function LanguageSection() {
  const { locale, setLocale, t } = useI18n();
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Languages size={18} className="text-brand-600" />
        <h3 className="font-semibold text-fg">{t("profile.languagePicker")}</h3>
      </div>
      <Field label={t("common.language")}>
        <Select value={locale} onChange={(e) => setLocale(e.target.value as LocaleId)}>
          {LOCALES.map((l) => (
            <option key={l.id} value={l.id}>{l.nativeName} ({l.name})</option>
          ))}
        </Select>
      </Field>
    </Card>
  );
}

function PrivacySection() {
  const { t } = useI18n();
  const { consent, setConsent } = useConsent();
  const [analytics, setAnalytics] = useState(consent.analytics);
  const [marketing, setMarketing] = useState(consent.marketing);
  const [confirmText, setConfirmText] = useState("");
  const [busyDelete, setBusyDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function saveConsent() {
    setConsent({ analytics, marketing });
  }

  async function deleteAccount() {
    if (confirmText !== "DELETE") return;
    setDeleteError(null);
    setBusyDelete(true);
    try {
      const res = await fetch("/api/profile/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setDeleteError(j.error ?? "Couldn't delete");
        return;
      }
      // Sign out and bounce home
      await signOut({ callbackUrl: "/" });
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={18} className="text-brand-600" />
        <h3 className="font-semibold text-fg">{t("profile.privacy")}</h3>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        We respect your data rights under GDPR and CCPA. Manage your consent below, download a full
        export, or request account deletion.
      </p>

      <div className="mt-5 space-y-3">
        <ConsentToggle label={t("consent.necessary")} hint={t("consent.necessaryHelp")} checked disabled />
        <ConsentToggle label={t("consent.analytics")} hint={t("consent.analyticsHelp")} checked={analytics} onChange={setAnalytics} />
        <ConsentToggle label={t("consent.marketing")} hint={t("consent.marketingHelp")} checked={marketing} onChange={setMarketing} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
        <Button variant="ghost" onClick={saveConsent}>{t("consent.savePrefs")}</Button>
      </div>

      <div className="mt-6 pt-6 border-t border-line space-y-3">
        <a
          href="/api/profile/export"
          download
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <Download size={14} /> {t("profile.exportData")}
        </a>
      </div>

      <div className="mt-6 pt-6 border-t border-line">
        <p className="text-sm font-semibold text-fg flex items-center gap-2 text-rose-700">
          <Trash2 size={14} /> {t("profile.deleteAccount")}
        </p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Anonymizes your account immediately and permanently removes personal data within 30 days.
          Audit log entries are retained in compliance with regulatory record-keeping. Type
          <strong> DELETE </strong> to confirm.
        </p>
        <div className="mt-3 flex items-center gap-2 max-w-sm">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
          />
          <Button
            variant="danger"
            onClick={deleteAccount}
            loading={busyDelete}
            disabled={confirmText !== "DELETE"}
          >
            Delete account
          </Button>
        </div>
        {deleteError && <div className="mt-3 max-w-sm"><Alert tone="danger">{deleteError}</Alert></div>}
      </div>
    </Card>
  );
}

function ConsentToggle({ label, hint, checked, disabled, onChange }: {
  label: string; hint: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void;
}) {
  return (
    <label className={
      "flex items-start gap-3 p-3 rounded-xl border border-line " +
      (disabled ? "bg-elevated/40 cursor-not-allowed" : "hover:border-line-strong cursor-pointer")
    }>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 accent-brand-600"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        <p className="text-xs text-muted mt-0.5">{hint}</p>
      </div>
    </label>
  );
}
