"use client";
/**
 * HrFlowChart — interactive flowchart of every route + feature in the HR module.
 *
 * Admin-only. Rendered at the bottom of /employer after the feature inventory.
 * Click any node to open a detail panel showing description, API routes, and bullets.
 */

import { useState } from "react";
import Link from "next/link";
import {
  X, ExternalLink, Globe, Briefcase, GitBranch,
  Wrench, Bell, Users, BarChart3, Calendar, Mail,
  Filter, ArrowRight, ChevronRight, CircleDot, Layers,
  Send, ClipboardList, UserCheck, Copy, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

type Cat = "public" | "employer" | "pipeline" | "tool" | "system";

interface ApiCall {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  desc: string;
}

interface FlowNode {
  id: string;
  label: string;
  sub?: string;
  route?: string;
  cat: Cat;
  description: string;
  apis?: ApiCall[];
  bullets?: string[];
  icon?: React.ElementType;
}

// ── Node data ─────────────────────────────────────────────────────

const NODES: FlowNode[] = [
  // ── Candidate public path ──────────────────────────────────────
  {
    id: "jobs-board",
    label: "Public Job Board",
    sub: "/jobs",
    route: "/jobs",
    cat: "public",
    icon: Globe,
    description: "No-auth job listing. All active postings in a responsive card grid. Supports ?q= text search and ?type= chip filters. Footer CTAs for trainees and employers.",
    apis: [],
    bullets: [
      "Card grid layout with posting title, skills chips, compensation, deadline",
      "?q= full-text search across title + description",
      "?type= chip filter (full-time, part-time, contract, etc.)",
      "Each card links to /jobs/[id] detail page",
    ],
  },
  {
    id: "job-detail",
    label: "Job Detail",
    sub: "/jobs/[id]",
    route: "/jobs/[id]",
    cat: "public",
    icon: Briefcase,
    description: "Full posting detail. Returns 404 for inactive/closed postings. 3-column info row, key skills chips, pre-wrap description, apply CTA.",
    bullets: [
      "3-column info row: location, type, compensation",
      "Key skills chips (from keySkills[])",
      "Position details rendered as pre-wrap prose",
      "Apply CTA → /jobs/[id]/apply",
      "notFound() guard if posting is not active",
    ],
  },
  {
    id: "apply-form",
    label: "Apply Form",
    sub: "/jobs/[id]/apply",
    route: "/jobs/[id]/apply",
    cat: "public",
    icon: Send,
    description: "Direct-apply form. Prefills name/email from session if logged in. Validates cover letter length (100–3000 chars). Deduplicates submissions.",
    apis: [
      { method: "POST", path: "/api/jobs/[id]/apply", desc: "Validates fields, deduplicates via source=job-apply-{id}, creates AccessRequest row" },
    ],
    bullets: [
      "Full name + email (hidden when prefilled from session)",
      "Phone — optional",
      "Cover letter: 100–3000 char counter",
      "Resume URL field",
      "Green success card + error message on inline failure",
    ],
  },
  {
    id: "access-request",
    label: "AccessRequest Created",
    sub: "kind = trainee, source = job-apply-{id}",
    cat: "system",
    icon: CircleDot,
    description: "Application lands as an AccessRequest row in the DB. Admin can approve/deny; approved requests create a trainee account and the applicant appears in the employer's postings queue.",
    bullets: [
      "Deduplication: one row per (email, source) — safe to re-submit",
      "kind = 'trainee', source = 'job-apply-{postingId}'",
      "Admin approves at /admin/access-requests",
      "Approval creates user + ApplicationStatus row",
    ],
  },

  // ── Employer setup ─────────────────────────────────────────────
  {
    id: "employer-home",
    label: "Employer Overview",
    sub: "/employer",
    route: "/employer",
    cat: "employer",
    icon: Layers,
    description: "Brand-stage home page. Shows company profile, stats bar, action queue callout, and hiring shopfront. Onboarding wizard appears for fresh accounts.",
    bullets: [
      "Full-bleed cinematic cover banner (5-stop gradient, 4 aurora blobs)",
      "Logo disc with crop/shape/transform settings",
      "Profile editor modal (pencil icon) — URL auto-fill via Clearbit",
      "Stats bar: postings live, applicants reviewed, interviews held, team members",
      "Pending join requests callout (amber banner)",
      "Action queue callout: new / stale ≥7d / offer-waiting ≥2d",
      "Hiring shopfront: top 5 live postings as scannable rows",
      "OnboardingWizard: 4-step card (localStorage-persisted dismiss)",
    ],
  },
  {
    id: "onboarding-wizard",
    label: "Onboarding Wizard",
    sub: "OnboardingWizard.tsx (fixed bottom-left)",
    cat: "employer",
    icon: Briefcase,
    description: "4-step guided card for new employers. Covers profile setup, first posting, team invite, and completion. Minimisable, localStorage-persisted.",
    bullets: [
      "Step 1: Set up company profile → /employer#profile",
      "Step 2: Post your first role → /employer/postings",
      "Step 3: Invite teammates → /employer/team",
      "Step 4: You're ready — Explore the workspace",
      "Animated progress bar",
      "Minimise pill + permanent dismiss",
    ],
  },

  // ── Postings workspace ─────────────────────────────────────────
  {
    id: "postings-workspace",
    label: "My Postings",
    sub: "/employer/postings",
    route: "/employer/postings",
    cat: "employer",
    icon: ClipboardList,
    description: "Primary HR workspace. Expandable posting rows with full applicant pipeline, per-posting tools, and demo seeder.",
    apis: [
      { method: "GET",    path: "/api/employer/postings",     desc: "Lists postings scoped to company, ordered newest first" },
      { method: "POST",   path: "/api/employer/postings",     desc: "Creates posting (manager+)" },
      { method: "PATCH",  path: "/api/employer/postings/[id]", desc: "Updates title, skills, deadline, status, etc." },
      { method: "DELETE", path: "/api/employer/postings/[id]", desc: "Soft-delete / close" },
    ],
    bullets: [
      "Status tabs: all / active / draft / paused / closed",
      "NewPostingInline: paste JD → AI fills fields → save",
      "HrWorkspace: per-posting expandable rows",
      "Action queue per row (new / stale / offer-waiting) with quick-move buttons",
      "Demo seeder: seeds 3 postings + applicants at every stage",
    ],
  },
  {
    id: "duplicate-posting",
    label: "Duplicate Posting",
    sub: "POST /api/employer/postings/[id]/duplicate",
    cat: "system",
    icon: Copy,
    description: "Two-step confirm button in the posting row header. Creates a draft copy titled '<original> (Copy)' instantly.",
    apis: [
      { method: "POST", path: "/api/employer/postings/[id]/duplicate", desc: "Copies all posting fields, sets status=draft, isDemoSeed=false, new createdById" },
    ],
  },

  // ── Pipeline stages ────────────────────────────────────────────
  {
    id: "stage-new",
    label: "New",
    sub: "status = new",
    cat: "pipeline",
    description: "Application just arrived. Lands in employer action queue. No interview or offer created yet.",
    bullets: ["Appears in action queue immediately", "Employer can read full trainee profile + resume"],
  },
  {
    id: "stage-reviewing",
    label: "Reviewing",
    sub: "status = reviewing",
    cat: "pipeline",
    description: "Employer has started reviewing. Can leave employer-visible comments, view resume, check talent-pool profile.",
  },
  {
    id: "stage-shortlisted",
    label: "Shortlisted",
    sub: "status = shortlisted",
    cat: "pipeline",
    description: "Candidate selected for next steps. Appears separately in shortlisted count on analytics page.",
  },
  {
    id: "stage-phone",
    label: "Phone Screen",
    sub: "status = phone_screen",
    cat: "pipeline",
    description: "Phone screen scheduled. An Interview row is created. Candidate selects a slot; acceptedSlot appears on the calendar.",
    apis: [
      { method: "POST", path: "/api/applications/[id]/interview", desc: "Creates Interview with proposedSlots, format=phone" },
      { method: "POST", path: "/api/applications/[id]/interview/respond", desc: "Candidate selects an acceptedSlot" },
    ],
  },
  {
    id: "stage-onsite",
    label: "On-site / Final",
    sub: "status = onsite",
    cat: "pipeline",
    description: "On-site or final-round interview. Interview row created with format=video or on_site. Shows on calendar.",
    apis: [
      { method: "POST", path: "/api/applications/[id]/interview", desc: "Creates Interview with format=video or on_site" },
    ],
  },
  {
    id: "stage-offer",
    label: "Offer Extended",
    sub: "status = offer",
    cat: "pipeline",
    description: "Offer extended. Offer row created with compensation + terms. Appears in action queue if no candidate response in 2 days.",
    apis: [
      { method: "POST",  path: "/api/employer/applications/[id]/offer",         desc: "Creates Offer row, notifies candidate" },
      { method: "POST",  path: "/api/applications/[id]/offer/respond",           desc: "Candidate accepts or declines" },
    ],
    bullets: [
      "Offer row: compensation, startDate, terms, expiresAt",
      "Trainee sees accept/decline UI at /applications/[id]/offer",
      "Accept → status moves to hired",
      "Decline → status moves back to onsite or rejected",
    ],
  },
  {
    id: "stage-hired",
    label: "Hired ✓",
    sub: "status = hired",
    cat: "pipeline",
    description: "Offer accepted. Candidate joins the hired pool. Triggers hired email. Counts in analytics dashboard.",
  },
  {
    id: "stage-rejected",
    label: "Rejected",
    sub: "status = passed",
    cat: "pipeline",
    description: "Application rejected from any stage. buildTransitionCopy() generates a rejection email body. notifyTransition() auto-fires it using the company's rejection EmailTemplate.",
    apis: [
      { method: "PATCH", path: "/api/employer/applications/[id]/transition", desc: "Body: { toStatus: 'passed' }. Fires rejection email post-commit." },
    ],
    bullets: [
      "Reachable from any active stage",
      "Auto-fires rejection email from EmailTemplate (kind=rejection)",
      "Uses {{candidateFirstName}}, {{postingTitle}} merge vars",
    ],
  },

  // ── Transition engine ──────────────────────────────────────────
  {
    id: "transition-engine",
    label: "Transition Engine",
    sub: "lib/hiring/transitions.ts",
    cat: "system",
    icon: GitBranch,
    description: "Server-side state machine for all pipeline moves. Validates allowed transitions, creates Interview/Offer rows, fires post-commit notifications.",
    apis: [
      { method: "PATCH", path: "/api/employer/applications/[id]/transition", desc: "Body: { toStatus }. Runs transitionApplication() then notifyTransition()" },
    ],
    bullets: [
      "Validates allowed stage transitions (no skipping locked paths)",
      "Auto-creates Interview row on → phone_screen / onsite",
      "Auto-creates Offer row on → offer",
      "buildTransitionCopy(stage, payload) generates email body per stage",
      "notifyTransition() fires email after successful DB commit",
      "writeEmployerAction() logs to EmployerActivityLog",
    ],
  },

  // ── Per-posting tools ──────────────────────────────────────────
  {
    id: "scorecard",
    label: "Scorecard Builder",
    sub: "/employer/postings/[id]/scorecard",
    route: "/employer/postings/[id]/scorecard",
    cat: "tool",
    icon: ClipboardList,
    description: "Rubric builder: up to 10 criteria each with label, description, and 4- or 5-point scale. Lock prevents edits once interviews begin. Interviewer submissions tracked per applicant.",
    apis: [
      { method: "GET",   path: "/api/employer/postings/[id]/scorecard",              desc: "Returns scorecard + criteria JSON" },
      { method: "POST",  path: "/api/employer/postings/[id]/scorecard",              desc: "Upserts criteria (≤10, checks locked)" },
      { method: "PATCH", path: "/api/employer/postings/[id]/scorecard",              desc: "Locks scorecard (owner only)" },
      { method: "GET",   path: "/api/employer/postings/[id]/scorecard/submissions",  desc: "Lists submissions with interviewer info" },
      { method: "POST",  path: "/api/employer/postings/[id]/scorecard/submissions",  desc: "Upserts by (scorecard, applicant, interviewer)" },
    ],
    bullets: [
      "ScorecardBuilder: up/down reorder, label + description + scale per criterion",
      "SubmissionsPanel: score grid per applicant-criterion pair",
      "Recommendation chips: strong_yes (emerald) / yes / no / strong_no (red)",
      "Lock button (owner only) — 409 if already locked",
    ],
  },
  {
    id: "hiring-team",
    label: "Hiring Team Panel",
    sub: "PostingTeamPanel (inline)",
    cat: "tool",
    icon: UserCheck,
    description: "Assign company members to a posting with a specific role. Collapsible panel at the bottom of each expanded posting row.",
    apis: [
      { method: "GET",    path: "/api/employer/postings/[id]/team", desc: "Returns teamMembers + companyMembers" },
      { method: "POST",   path: "/api/employer/postings/[id]/team", desc: "Upserts PostingTeamMember (manager+)" },
      { method: "DELETE", path: "/api/employer/postings/[id]/team", desc: "Removes member from posting team" },
    ],
    bullets: [
      "Roles: recruiter / hiring_manager / interviewer / observer",
      "Role chips with distinct colours per role",
      "Dropdown shows only company members not already on the team",
      "Two-step confirm on remove",
    ],
  },
  {
    id: "bulk-messaging",
    label: "Bulk Messaging",
    sub: "MessageComposer (inline)",
    cat: "tool",
    icon: Send,
    description: "Select applicants via checkboxes in the workspace, compose a freeform email with merge variables, and send to all selected.",
    apis: [
      { method: "POST", path: "/api/employer/applications/message", desc: "Sends to 1–100 applicants; demo-safe (counts sends without real SMTP if not configured)" },
    ],
    bullets: [
      "Checkbox multi-select on applicant rows + 'Select all' toggle",
      "Subject line + body (min 20 chars)",
      "{{candidateFirstName}} merge variable",
      "Two-step confirm before fire",
      "Shows up to 3 recipient names + +N more overflow",
      "Auto-clears selection + success flash after 3 s",
    ],
  },

  // ── Platform tools ─────────────────────────────────────────────
  {
    id: "templates",
    label: "Email Templates",
    sub: "/employer/templates",
    route: "/employer/templates",
    cat: "tool",
    icon: Mail,
    description: "Create, edit, and delete reusable email templates. Used by the transition engine for automated rejection/invite/offer emails. Grouped by kind.",
    apis: [
      { method: "GET",    path: "/api/employer/companies/[id]/templates",              desc: "Lists templates sorted by kind + createdAt (viewer+)" },
      { method: "POST",   path: "/api/employer/companies/[id]/templates",              desc: "Creates template (manager+)" },
      { method: "PATCH",  path: "/api/employer/companies/[id]/templates/[templateId]", desc: "Updates name/subject/body/kind" },
      { method: "DELETE", path: "/api/employer/companies/[id]/templates/[templateId]", desc: "Deletes; 409 if isStarter=true" },
    ],
    bullets: [
      "Kinds: rejection / interview_invite / offer / follow_up / general",
      "Merge vars: {{candidateFirstName}}, {{postingTitle}}, {{companyName}}, {{interviewDate}}, {{offerCompensation}}",
      "One-click chip inserts variable at cursor position",
      "Starter templates (isStarter=true) protected from deletion",
      "Inline slide-down form — no modal/dialog",
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    sub: "/employer/analytics",
    route: "/employer/analytics",
    cat: "tool",
    icon: BarChart3,
    description: "Pipeline analytics: stage funnel, offer acceptance rate, avg days-per-stage velocity, CSV export.",
    apis: [
      { method: "GET", path: "/api/employer/analytics",        desc: "Stage counts, conversion rates, velocity per posting + company summary" },
      { method: "GET", path: "/api/employer/analytics/export", desc: "CSV with Content-Disposition: attachment, one row per ApplicationStatus" },
    ],
    bullets: [
      "4 summary cards: total applicants / shortlisted / offers / hired",
      "Per-posting funnel table (stage counts)",
      "Horizontal velocity bars (avg days in each stage)",
      "CSV columns: posting, applicant, email, stage, daysInStage, stageEnteredAt",
    ],
  },
  {
    id: "calendar",
    label: "Interview Calendar",
    sub: "/employer/calendar",
    route: "/employer/calendar",
    cat: "tool",
    icon: Calendar,
    description: "Week-view calendar of all upcoming interviews across postings. Desktop grid + mobile stacked list.",
    apis: [
      { method: "GET", path: "/api/employer/calendar?from=ISO&to=ISO", desc: "Fetches interviews for all company postings, filters by acceptedSlot or proposedSlots in range" },
    ],
    bullets: [
      "CalendarClient: week navigation (Previous / Next), defaults to current Mon–Sun",
      "Desktop: 7-column Mon–Sun grid, events as compact cards",
      "Mobile: stacked chronological list",
      "Format chips: PhoneCall / Video / MapPin icons",
      "Confirmed chip (emerald) vs Pending chip (amber)",
    ],
  },
  {
    id: "notifications",
    label: "Notification Inbox",
    sub: "NotificationBell + drawer",
    cat: "tool",
    icon: Bell,
    description: "Bell icon in sidebar header with unread badge. Drawer shows notifications grouped by day with per-reason icons and mark-read actions.",
    apis: [
      { method: "GET",  path: "/api/notifications?limit=&offset=",  desc: "Returns notifications with activityCopy() text + unreadCount" },
      { method: "POST", path: "/api/notifications/[id]/read",        desc: "Stamps readAt on one notification (userId ownership check)" },
      { method: "POST", path: "/api/notifications/read-all",         desc: "Stamps readAt on all unread for current user" },
    ],
    bullets: [
      "Server-side unreadCount fetched on every dashboard page load",
      "Drawer: day-grouped notification list",
      "Per-reason icons (new app, stage change, interview, offer, etc.)",
      "Click notification → navigates to relevant posting",
      "Mark all read button clears badge instantly",
    ],
  },
  {
    id: "team-mgmt",
    label: "Team Management",
    sub: "/employer/team",
    route: "/employer/team",
    cat: "tool",
    icon: Users,
    description: "Manage company members, invite teammates, review domain-match join requests. 4-tier role system.",
    apis: [
      { method: "GET",    path: "/api/employer/companies/[id]/members",         desc: "Lists members with roles and last-seen" },
      { method: "POST",   path: "/api/employer/companies/[id]/invites",          desc: "Sends invite email; creates pending invite row" },
      { method: "PATCH",  path: "/api/employer/companies/[id]/members/[userId]", desc: "Changes member role" },
      { method: "DELETE", path: "/api/employer/companies/[id]/members/[userId]", desc: "Removes member" },
    ],
    bullets: [
      "4-tier roles: owner (4) → manager (3) → generalist (2) → viewer (1)",
      "Owner: full admin incl. delete company",
      "Manager: invite, approve, change roles",
      "Generalist: create + manage postings",
      "Viewer: read-only",
      "7-day invite expiry, revocable",
      "Domain-match join requests auto-suggested for approval",
      "Demo team seeder: 3 demo members with staggered timestamps",
    ],
  },
  {
    id: "talent-pool",
    label: "Talent Pool",
    sub: "/talent-pool",
    route: "/talent-pool",
    cat: "tool",
    icon: Filter,
    description: "Browse BHN's verified talent pool. Filter by skills, pipeline stage, and availability. Leave employer-visible comments.",
    bullets: [
      "Skills filter: comma-separated skill names (OR logic within the set)",
      "Stage filter: new / reviewing / shortlisted / phone_screen / onsite / offer",
      "Availability filter: excludes candidates already in offer or hired stages",
      "All 3 filters AND-combined with existing text search (?q=)",
      "Employer-visible comments (hidden from trainees)",
      "TalentPoolFilterBar component (GET form — URL-persisted)",
    ],
  },
];

// ── Category styles ────────────────────────────────────────────────

const CAT_META: Record<Cat, { label: string; card: string; badge: string; dot: string; border: string }> = {
  public:   { label: "Public",   dot: "bg-sky-500",     badge: "bg-sky-100 text-sky-800 ring-sky-200",       card: "border-sky-200 bg-sky-50/60 hover:border-sky-400",       border: "border-sky-300" },
  employer: { label: "Employer", dot: "bg-brand-500",   badge: "bg-brand-100 text-brand-800 ring-brand-200", card: "border-brand-200 bg-brand-50/60 hover:border-brand-400", border: "border-brand-300" },
  pipeline: { label: "Pipeline", dot: "bg-violet-500",  badge: "bg-violet-100 text-violet-800 ring-violet-200", card: "border-violet-200 bg-violet-50/60 hover:border-violet-400", border: "border-violet-300" },
  tool:     { label: "Tool",     dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 ring-emerald-200", card: "border-emerald-200 bg-emerald-50/60 hover:border-emerald-400", border: "border-emerald-300" },
  system:   { label: "System",   dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-800 ring-amber-200", card: "border-amber-200 bg-amber-50/60 hover:border-amber-400",  border: "border-amber-300" },
};

const METHOD_STYLE: Record<string, string> = {
  GET:    "bg-emerald-50 text-emerald-700 ring-emerald-200",
  POST:   "bg-blue-50 text-blue-700 ring-blue-200",
  PATCH:  "bg-amber-50 text-amber-700 ring-amber-200",
  DELETE: "bg-rose-50 text-rose-700 ring-rose-200",
};

// ── FlowNode card ─────────────────────────────────────────────────

function NodeCard({ node, selected, onClick }: { node: FlowNode; selected: boolean; onClick: () => void }) {
  const meta = CAT_META[node.cat];
  const Icon = node.icon ?? CircleDot;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-xl border-2 px-3 py-2.5 transition-all duration-150 cursor-pointer min-w-[120px] shrink-0",
        meta.card,
        selected && "ring-2 ring-offset-1 ring-brand-500 scale-[1.03] shadow-md z-10",
      )}
    >
      <div className="flex items-start gap-1.5">
        <Icon size={12} className="mt-0.5 shrink-0 text-fg/60" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-fg leading-tight">{node.label}</p>
          {node.sub && (
            <p className="text-[9px] text-muted mt-0.5 font-mono leading-tight truncate max-w-[130px]">{node.sub}</p>
          )}
        </div>
      </div>
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-brand-500 ring-2 ring-white" />
      )}
    </button>
  );
}

// ── Arrow connector ───────────────────────────────────────────────

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center shrink-0 select-none">
      <div className="flex items-center gap-0.5">
        <div className="w-4 h-px bg-line" />
        <ArrowRight size={10} className="text-muted -ml-1" />
      </div>
      {label && <span className="text-[8px] text-subtle mt-0.5">{label}</span>}
    </div>
  );
}

function DownArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center shrink-0 select-none my-1">
      <div className="w-px h-3 bg-line" />
      <div
        className="w-0 h-0"
        style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid var(--line)" }}
      />
      {label && <span className="text-[8px] text-subtle mt-0.5">{label}</span>}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const meta = CAT_META[node.cat];
  const Icon = node.icon ?? CircleDot;
  return (
    <div className="rounded-2xl border-2 bg-card shadow-elevated-panel overflow-hidden" style={{ borderColor: "var(--line)" }}>
      {/* Header */}
      <div className={cn("px-5 py-4 border-b flex items-start justify-between gap-3", meta.border, "bg-elevated/50")}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", meta.badge, "ring-1")}>
            <Icon size={15} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-fg">{node.label}</h3>
              <span className={cn("text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1", meta.badge)}>
                {meta.label}
              </span>
            </div>
            {node.sub && (
              <p className="text-[10px] font-mono text-muted mt-0.5">{node.sub}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {node.route && (
            <Link
              href={node.route}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-700 hover:underline"
            >
              Open <ExternalLink size={10} />
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-fg hover:bg-elevated transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4 max-h-72 overflow-y-auto">
        <p className="text-xs text-fg leading-relaxed">{node.description}</p>

        {node.apis && node.apis.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-subtle mb-2">API Routes</p>
            <div className="space-y-1.5">
              {node.apis.map((api) => (
                <div key={api.path} className="flex items-start gap-2">
                  <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded ring-1 ring-inset shrink-0 tabular-nums w-11 text-center", METHOD_STYLE[api.method])}>
                    {api.method}
                  </span>
                  <div className="min-w-0">
                    <code className="text-[10px] font-mono text-fg">{api.path}</code>
                    <p className="text-[10px] text-muted leading-snug">{api.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {node.bullets && node.bullets.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-subtle mb-2">Details</p>
            <ul className="space-y-1">
              {node.bullets.map((b) => (
                <li key={b} className="flex items-start gap-1.5 text-xs text-fg">
                  <ChevronRight size={10} className="mt-0.5 text-brand-400 shrink-0" />
                  <span className="leading-snug">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function HrFlowChart() {
  const [selected, setSelected] = useState<string | null>(null);

  const selectedNode = NODES.find((n) => n.id === selected);

  function select(id: string) {
    setSelected((cur) => (cur === id ? null : id));
  }

  function node(id: string) {
    const n = NODES.find((x) => x.id === id)!;
    return <NodeCard key={id} node={n} selected={selected === id} onClick={() => select(id)} />;
  }

  return (
    <section aria-label="HR module interactive flowchart" className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-subtle mb-1.5 inline-flex items-center gap-2">
          <span aria-hidden className="w-6 h-px" style={{ background: "linear-gradient(90deg,rgb(56,189,248),rgb(124,58,237))" }} />
          Interactive Flowchart
        </p>
        <h2 className="text-xl font-bold text-fg">HR module — every route & feature</h2>
        <p className="text-xs text-muted mt-1">Click any node to see API routes, component details, and capabilities.</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(CAT_META) as [Cat, typeof CAT_META[Cat]][]).map(([cat, meta]) => (
          <span key={cat} className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ring-1", meta.badge)}>
            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[10px] text-subtle ml-1">
          — click any node to inspect
        </span>
      </div>

      {/* Chart body */}
      <div className="rounded-2xl border border-line bg-elevated/30 p-5 overflow-x-auto">
        <div className="min-w-[900px] space-y-6">

          {/* ── SECTION 1: Candidate path ───────────────────────── */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-sky-600 mb-2.5 flex items-center gap-1.5">
              <Globe size={9} /> Candidate Path (public, no auth required)
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {node("jobs-board")}
              <Arrow />
              {node("job-detail")}
              <Arrow />
              {node("apply-form")}
              <Arrow label="POST /api/jobs/[id]/apply" />
              {node("access-request")}
              <Arrow label="admin approves" />
              <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/40 px-3 py-2 text-[10px] font-semibold text-violet-700">
                Appears in applicant queue →
              </div>
            </div>
          </div>

          {/* ── SECTION 2: Employer setup ───────────────────────── */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-brand-600 mb-2.5 flex items-center gap-1.5">
              <Briefcase size={9} /> Employer Entry
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              {node("employer-home")}
              <Arrow label="pencil icon" />
              {node("onboarding-wizard")}
              <div className="mx-2 text-muted text-xs">·</div>
              {node("employer-home")}
              <Arrow label="Manage postings" />
              {node("postings-workspace")}
              <Arrow label="header button" />
              {node("duplicate-posting")}
            </div>
          </div>

          {/* ── SECTION 3: Pipeline stages ──────────────────────── */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-violet-600 mb-2.5 flex items-center gap-1.5">
              <GitBranch size={9} /> Hiring Pipeline (7 stages + rejected)
            </p>
            <div className="space-y-2">
              {/* Main flow */}
              <div className="flex items-center gap-1 flex-wrap">
                {node("stage-new")}
                <Arrow />
                {node("stage-reviewing")}
                <Arrow />
                {node("stage-shortlisted")}
                <Arrow />
                {node("stage-phone")}
                <Arrow />
                {node("stage-onsite")}
                <Arrow />
                {node("stage-offer")}
                <Arrow />
                {node("stage-hired")}
              </div>
              {/* Rejected branch + engine */}
              <div className="flex items-center gap-1 flex-wrap">
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-3 py-1.5 text-[9px] font-semibold text-amber-700 whitespace-nowrap">
                  any stage
                </div>
                <Arrow label="move to rejected" />
                {node("stage-rejected")}
                <div className="mx-2 text-muted text-xs">·</div>
                <span className="text-[9px] text-muted">All stage transitions go through →</span>
                <div className="mx-1" />
                {node("transition-engine")}
              </div>
            </div>
          </div>

          {/* ── SECTION 4: Per-posting tools ───────────────────── */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-emerald-700 mb-2.5 flex items-center gap-1.5">
              <Wrench size={9} /> Per-Posting Tools (from expanded posting row)
            </p>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/40 px-3 py-2 text-[10px] font-semibold text-violet-700 whitespace-nowrap">
                My Postings workspace
              </div>
              <Arrow />
              {node("scorecard")}
              <div className="mx-1 text-muted text-xs">·</div>
              {node("hiring-team")}
              <div className="mx-1 text-muted text-xs">·</div>
              {node("bulk-messaging")}
            </div>
          </div>

          {/* ── SECTION 5: Platform tools ───────────────────────── */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-emerald-700 mb-2.5 flex items-center gap-1.5">
              <Wrench size={9} /> Platform Tools (sidebar nav)
            </p>
            <div className="flex flex-wrap gap-2">
              {node("templates")}
              {node("analytics")}
              {node("calendar")}
              {node("notifications")}
              {node("team-mgmt")}
              {node("talent-pool")}
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div className="animate-in slide-in-from-bottom-2 duration-150">
          <DetailPanel node={selectedNode} onClose={() => setSelected(null)} />
        </div>
      )}

      {!selected && (
        <p className="text-[10px] text-subtle text-center">
          ↑ Click any node above to see API routes, component details, and capabilities
        </p>
      )}
    </section>
  );
}
