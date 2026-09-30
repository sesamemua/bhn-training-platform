import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Palette, Type, Box, Layers, Zap, Accessibility, Sparkles,
  CheckCircle2, AlertTriangle, Info, XCircle, Plus, Loader2, ArrowRight, Check, Hourglass, ExternalLink,
  Rocket, Pencil, Wand2,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getActiveDesignSystem } from "@/lib/settings";
import { DesignSystemAdminPicker } from "@/components/admin/DesignSystemAdminPicker";
import { DesignSystemShowroom } from "@/components/admin/DesignSystemShowroom";
import {
  LaunchSwitchDemo, LaunchSwitchMediumDemo,
  LaunchSwitchClassicDemo, LaunchSwitchClassicMediumDemo,
  LaunchSwitchFacetDemo, LaunchSwitchFacetMediumDemo,
} from "@/components/admin/LaunchSwitchPreview";
import { InputDialogPreview } from "@/components/admin/InputDialogPreview";
import { ConfirmDialogPreview } from "@/components/admin/ConfirmDialogPreview";

/**
 * /admin/design-system — live mirror of docs/design-system.md.
 *
 * The doc is the canonical reference (commits + reviewable in PRs);
 * this page renders the tokens + components inline so the system
 * stays in sync with what's actually shipped. Each section pulls
 * directly from the same Tailwind utility classes the rest of the
 * platform uses — if a token here renders differently than expected,
 * the issue is in the Tailwind config + theme variables, not in
 * this surface.
 *
 * Sections:
 *   1. Surfaces (Page / Card / Elevated / Popover / Overlay)
 *   2. Brand color scale (50 → 900)
 *   3. Status palettes (success / pending / warning / error / neutral)
 *   4. Type scale
 *   5. Radius scale
 *   6. Elevation / shadow scale
 *   7. Motion primitives — visible-but-restrained
 *   8. Component patterns — buttons / banners / status chips / form fields
 *   9. Accessibility checklist
 *
 * Audience: admins extending the platform, contributors orienting
 * to the codebase, anyone asking "what's the token for X?"
 */
export default async function AdminDesignSystemPage() {
  const session = await requireRole("admin").catch(() => null);
  if (!session) redirect("/dashboard");

  // Active design system id — drives the platform-wide layout
  // vocabulary picker at the top of this page (the rest of the
  // page is a tokens reference and doesn't depend on which DS is
  // active).
  const activeDesignSystem = await getActiveDesignSystem();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-10">
      <header>
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">
          Admin · Design &amp; Research
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-fg mt-1 tracking-tight inline-flex items-center gap-2">
          <Palette size={22} className="text-brand-600" />
          Design system
        </h1>
        <p className="text-sm text-muted mt-2 max-w-2xl leading-relaxed">
          Live mirror of <code className="font-mono text-fg bg-elevated px-1 rounded">docs/design-system.md</code>.
          Every token here is rendered with the same Tailwind utility the rest
          of the platform uses — what you see is exactly what ships.
        </p>
        <p className="text-xs text-muted mt-3">
          For the doc, see{" "}
          <Link
            href="https://github.com/sesamemua/bhn-training-platform/blob/main/docs/design-system.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 font-semibold hover:underline inline-flex items-center gap-1"
          >
            docs/design-system.md <ExternalLink size={11} />
          </Link>
          {" · "}
          For the UX charter:{" "}
          <Link
            href="https://github.com/sesamemua/bhn-training-platform/blob/main/docs/ux/charter.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 font-semibold hover:underline inline-flex items-center gap-1"
          >
            docs/ux/charter.md <ExternalLink size={11} />
          </Link>
        </p>
      </header>

      {/* ── 0. Platform-wide active design system ─────────────── */}
      <Section icon={Layers} title="Active design system" eyebrow="00">
        <p className="text-sm text-muted leading-relaxed mb-2">
          Layout vocabulary applied to <strong>every user of the platform</strong>.
          Color theme stays a per-user preference (picker in the sidebar
          footer); design system is a platform decision and lives here.
        </p>
        <p className="text-[11px] text-subtle mb-4 leading-snug">
          Stored as <code className="font-mono text-fg bg-elevated px-1 rounded">PlatformSetting.activeDesignSystem</code>.
          The root layout reads it server-side and stamps it onto
          <code className="font-mono text-fg bg-elevated px-1 rounded ml-1">&lt;html data-design-system=&quot;…&quot;&gt;</code>
          — no flash, no per-user override. Users see the new look on
          their next navigation after you apply.
        </p>
        <p className="text-[11px] text-emerald-700 mb-4 inline-flex items-center gap-1.5">
          <Sparkles size={11} />
          Route-scoped exception: <code className="font-mono text-fg bg-elevated px-1 rounded">/employer/*</code> + the HR-preview block always render the <strong>Studio</strong> system, regardless of the platform default.
        </p>
        <DesignSystemAdminPicker initial={activeDesignSystem} />
        <Link
          href="/admin/design-system/lab"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-900"
        >
          Open the Design-system Lab — composer + token tweaker →
        </Link>
      </Section>

      {/* ── 00b. Showroom — live previews ─────────────────────── */}
      {/* The picker above is the *decision* surface; this is the
          *evidence* surface. Same sample JSX rendered once per
          registered DS so admins can see what they're picking
          before they commit. New design systems auto-appear here
          on the next deploy — driven entirely by DESIGN_SYSTEMS
          in src/lib/design-system/registry.ts. */}
      <DesignSystemShowroom
        title="Live preview of every design system"
        blurb="Each panel below renders the same DSPageHeader + DSStatGrid + DSSection content under one design system. Use this to compare hero treatment, density, and chrome before applying the picker above. The Lab page lets you tweak Studio tokens live."
      />

      {/* ── 1. Surfaces ───────────────────────────────────────── */}
      <Section icon={Layers} title="Surfaces" eyebrow="01">
        <p className="text-sm text-muted leading-relaxed mb-4">
          Five named surface layers. Each carries an implicit z-index
          contract — never stack a Popover behind a Card; never put a
          Page background on a Card.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SurfaceSwatch name="Page" cls="bg-background text-fg" caption="bg-background" />
          <SurfaceSwatch name="Card" cls="bg-card text-fg surface-shadow" caption="bg-card · surface-shadow" />
          <SurfaceSwatch name="Elevated" cls="bg-elevated text-fg" caption="bg-elevated" />
          <SurfaceSwatch name="Popover" cls="popover" caption="popover (utility)" />
          <SurfaceSwatch name="Overlay" cls="bg-backdrop text-white" caption="bg-backdrop · z-40" />
          <SurfaceSwatch name="Glass" cls="glass text-fg" caption="glass (sidebar/header)" />
        </div>
      </Section>

      {/* ── 2. Brand scale ────────────────────────────────────── */}
      <Section icon={Palette} title="Brand color scale" eyebrow="02">
        <p className="text-sm text-muted leading-relaxed mb-4">
          The brand-N tokens swap per theme. Usage stays constant —
          brand-600 is always the primary action color, regardless of
          whether the user picked Scientific or Rosalind or Retro 8-bit.
        </p>
        <div className="grid grid-cols-5 sm:grid-cols-9 gap-2">
          {[50, 100, 200, 300, 400, 500, 600, 700, 800].map((n) => (
            <BrandSwatch key={n} step={n} />
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Pair k="brand-50" v="Soft fill — banner backgrounds, focused row tint" />
          <Pair k="brand-200" v="Ring/outline on focused cards" />
          <Pair k="brand-500" v="Focus ring (focus:ring-brand-500/30)" />
          <Pair k="brand-600" v="Primary action — buttons, links, primary icons" />
          <Pair k="brand-700" v="Hover state for primary; primary text on light fill" />
          <Pair k="brand-800" v="Strong text on brand-tinted backgrounds" />
        </dl>
      </Section>

      {/* ── 3. Status palettes ────────────────────────────────── */}
      <Section icon={CheckCircle2} title="Status palettes" eyebrow="03">
        <p className="text-sm text-muted leading-relaxed mb-4">
          Five sentiments. Each gets a fill + text + ring triple. Status
          colors do NOT swap per theme — they're meaning-bearing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatusSwatch
            label="Success / confirmed"
            chip="bg-emerald-100 text-emerald-800 ring-emerald-200"
            example="Approved"
          />
          <StatusSwatch
            label="Pending / approval"
            chip="bg-violet-100 text-violet-800 ring-violet-200"
            example="Pending approval"
          />
          <StatusSwatch
            label="Waitlist / warning"
            chip="bg-amber-100 text-amber-800 ring-amber-200"
            example="Waitlist #3"
          />
          <StatusSwatch
            label="Error / destructive"
            chip="bg-rose-100 text-rose-800 ring-rose-200"
            example="Cancelled"
          />
          <StatusSwatch
            label="Neutral"
            chip="bg-slate-100 text-slate-700 ring-slate-200"
            example="Draft"
          />
        </div>
      </Section>

      {/* ── 4. Type scale ─────────────────────────────────────── */}
      <Section icon={Type} title="Type scale" eyebrow="04">
        <div className="space-y-3">
          <TypeRow size="text-[10px] uppercase tracking-[0.22em] font-bold">
            Eyebrow · section label
          </TypeRow>
          <TypeRow size="text-[11px]">Metadata · inline label</TypeRow>
          <TypeRow size="text-xs">Caption · helper copy</TypeRow>
          <TypeRow size="text-sm">Body copy · form inputs</TypeRow>
          <TypeRow size="text-base">Body emphasis · list items</TypeRow>
          <TypeRow size="text-lg">Sub-section title</TypeRow>
          <TypeRow size="text-xl">Card title</TypeRow>
          <TypeRow size="text-2xl sm:text-3xl font-bold tracking-tight">Page H1</TypeRow>
        </div>
      </Section>

      {/* ── 5. Radius scale ───────────────────────────────────── */}
      <Section icon={Box} title="Radius scale" eyebrow="05">
        <p className="text-sm text-muted leading-relaxed mb-4">
          The platform's "voice" varies by theme — each theme picks
          its own radius. Defaults below are the <code className="font-mono text-fg bg-elevated px-1 rounded">light</code> theme; others override.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {[
            { cls: "rounded", label: "rounded" },
            { cls: "rounded-md", label: "rounded-md" },
            { cls: "rounded-lg", label: "rounded-lg" },
            { cls: "rounded-xl", label: "rounded-xl" },
            { cls: "rounded-2xl", label: "rounded-2xl" },
            { cls: "rounded-3xl", label: "rounded-3xl" },
            { cls: "rounded-full", label: "rounded-full" },
          ].map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-1.5">
              <div className={`w-14 h-14 bg-brand-100 ${r.cls}`} />
              <p className="text-[10px] font-mono text-subtle">{r.label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 6. Shadow / elevation ─────────────────────────────── */}
      <Section icon={Layers} title="Shadow scale" eyebrow="06">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ShadowBox label="surface-shadow" cls="surface-shadow" />
          <ShadowBox label="shadow-sm" cls="shadow-sm" />
          <ShadowBox label="shadow-md" cls="shadow-md" />
          <ShadowBox label="shadow-lg" cls="shadow-lg" />
        </div>
        <p className="text-xs text-muted mt-4 max-w-xl leading-relaxed">
          Never combine <code className="font-mono text-fg bg-elevated px-1 rounded">shadow-</code> and{" "}
          <code className="font-mono text-fg bg-elevated px-1 rounded">ring-</code> on the same element — rings own focus + selection states; shadows own elevation.
        </p>
      </Section>

      {/* ── 7. Motion ─────────────────────────────────────────── */}
      <Section icon={Zap} title="Motion primitives" eyebrow="07">
        <p className="text-sm text-muted leading-relaxed mb-4">
          Custom keyframes live in <code className="font-mono text-fg bg-elevated px-1 rounded">src/app/globals.css</code> and respect{" "}
          <code className="font-mono text-fg bg-elevated px-1 rounded">prefers-reduced-motion: reduce</code>.
        </p>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700">
              <Sparkles size={14} />
            </span>
            <div>
              <p className="font-semibold text-fg">animate-fade-in</p>
              <p className="text-xs text-muted">Popover appear, modal mount.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 admin-glow">
              <Sparkles size={14} />
            </span>
            <div>
              <p className="font-semibold text-fg">admin-glow</p>
              <p className="text-xs text-muted">Admin-only high-stakes buttons. Cyan/white pulsing ring. Static under reduced-motion.</p>
            </div>
          </li>
        </ul>
        <p className="text-xs text-muted mt-4 max-w-xl leading-relaxed">
          <strong className="text-fg">Idle motion budget:</strong> at most ONE animated element at idle. The EXPERIENCE guide deliberately stops idle motion after 30 seconds.
        </p>
      </Section>

      {/* ── 8. Components ─────────────────────────────────────── */}
      <Section icon={Box} title="Component patterns" eyebrow="08">
        <SubSection title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-2 text-sm font-bold hover:bg-brand-700 shadow-md shadow-brand-600/25">
              <Plus size={14} /> Primary
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:bg-elevated">
              Secondary
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl text-muted hover:text-fg hover:bg-elevated px-3 py-2 text-sm">
              Ghost
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 px-3 py-2 text-xs font-bold">
              <XCircle size={12} /> Destructive
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 text-white admin-glow hover:bg-emerald-800 px-3 py-2 text-xs font-bold">
              <Check size={12} /> Approval (admin)
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 px-3 py-1.5 text-xs font-bold">
              <Hourglass size={11} /> Request a spot
            </button>
            <button className="inline-flex items-center gap-2 rounded-xl bg-brand-600/40 text-white px-4 py-2 text-sm font-bold cursor-not-allowed opacity-50">
              <Loader2 size={14} className="animate-spin" /> Loading
            </button>
          </div>
        </SubSection>

        <SubSection title="Banners">
          <div className="space-y-3">
            <BannerExample
              tone="info"
              icon={Info}
              title="Heads up"
              body="Single-line note that nothing's wrong; you might want to know."
            />
            <BannerExample
              tone="warning"
              icon={Hourglass}
              title="Your spot is not guaranteed until admin approval"
              body="Pending-approval messaging. The canonical example — used on /events/[slug]/register."
            />
            <BannerExample
              tone="error"
              icon={AlertTriangle}
              title="Couldn't save"
              body="Actionable error. Always offers a path forward, never just states what failed."
            />
            <BannerExample
              tone="success"
              icon={CheckCircle2}
              title="Approved — confirmed"
              body="Admin queue success flash. Auto-dismisses after 3.5 s."
            />
          </div>
        </SubSection>

        <SubSection title="Status chips">
          <div className="flex flex-wrap gap-2">
            <Chip tone="emerald">Confirmed</Chip>
            <Chip tone="violet">Pending approval</Chip>
            <Chip tone="amber">Waitlist #3</Chip>
            <Chip tone="rose">Cancelled</Chip>
            <Chip tone="slate">Draft</Chip>
          </div>
        </SubSection>

        <SubSection title="Queue badges (new, May 2026)">
          <p className="text-xs text-muted mb-3 max-w-2xl leading-relaxed">
            Numeric chip stamped next to a nav-row label when a queue behind that route
            has items pending the role&apos;s attention. Brand fill ≤ 5 (informational),
            rose fill ≥ 6 (queue is piling up). Absence of the chip = nothing pending.
            Capped at <code className="font-mono text-[11px] bg-elevated px-1 rounded">99+</code> for visual stability.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <NavRowDemo label="Credit applications" count={3} />
            <NavRowDemo label="Role requests" count={12} />
            <NavRowDemo label="Pathway enrollments" count={0} />
            <NavRowDemo label="Inbox" count={142} />
          </div>
          <p className="text-[11px] text-subtle mt-3">
            See <code className="font-mono">docs/design-system.md → Queue badges</code> for the
            three-step &quot;how to add a new one&quot; recipe.
          </p>
        </SubSection>

        <SubSection title="Form fields">
          <div className="space-y-3 max-w-md">
            <div>
              <label htmlFor="ds-demo-email" className="block text-sm font-semibold text-fg mb-1.5">
                Email
              </label>
              <input
                id="ds-demo-email"
                type="email"
                placeholder="you@biohubnet.ca"
                className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
            <div>
              <label htmlFor="ds-demo-notes" className="block text-sm font-semibold text-fg mb-1.5">
                Notes
              </label>
              <textarea
                id="ds-demo-notes"
                rows={3}
                placeholder="Anything else we should know?"
                className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-y"
              />
            </div>
            <div>
              <label htmlFor="ds-demo-disabled" className="block text-sm font-semibold text-fg mb-1.5">
                Disabled
              </label>
              <input
                id="ds-demo-disabled"
                type="text"
                disabled
                value="Can't edit this"
                className="w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg disabled:opacity-60"
              />
            </div>
          </div>
        </SubSection>

        <SubSection title="CTA card (cross-prompt pattern)">
          <Link
            href="#"
            className="block rounded-2xl bg-brand-50 ring-1 ring-inset ring-brand-200 p-4 sm:p-5 hover:bg-brand-100 transition-colors group max-w-xl"
          >
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-brand-700">
              Cross-prompt example
            </p>
            <p className="text-sm font-bold text-fg mt-1">
              You haven't picked a tour yet
              <ArrowRight size={14} className="inline-block ml-1 text-brand-700 group-hover:translate-x-0.5 transition-transform" />
            </p>
            <p className="text-xs text-muted mt-1.5 leading-snug">
              Tours and the symposium are registered separately — pick one,
              both, or neither.
            </p>
          </Link>
        </SubSection>
      </Section>

      {/* ── 9. Accessibility ──────────────────────────────────── */}
      <Section icon={Accessibility} title="Accessibility checklist" eyebrow="09">
        <p className="text-sm text-muted leading-relaxed mb-4">
          Patterns the platform commits to. Each new surface is heuristic-walked against this list (see <code className="font-mono text-fg bg-elevated px-1 rounded">docs/ux/templates/design-critique.md</code>).
        </p>
        <ul className="space-y-2 text-sm">
          <A11yItem ok>Every interactive element shows a brand-500 focus ring on keyboard focus.</A11yItem>
          <A11yItem ok>
            <code className="font-mono text-fg bg-elevated px-1 rounded">prefers-reduced-motion</code> is honoured for every keyframe.
          </A11yItem>
          <A11yItem ok>Color is never the only signal — chips combine fill + icon + text.</A11yItem>
          <A11yItem ok>Skip-link present on the dashboard layout.</A11yItem>
          <A11yItem ok>Keyboard shortcuts (<code className="font-mono text-fg bg-elevated px-1 rounded">x</code>, <code className="font-mono text-fg bg-elevated px-1 rounded">xx</code>) gated to superadmin to avoid accidental activation.</A11yItem>
          <A11yItem todo>Quarterly WCAG 2.1 AA contrast sweep across all 9 themes — current cadence ad-hoc.</A11yItem>
          <A11yItem todo>Screen-reader walkthrough of every critical journey — not yet done.</A11yItem>
        </ul>
      </Section>

      <Section icon={Pencil} title="InputDialog — designed replacement for window.prompt" eyebrow="Component · input modal">
        <p className="text-sm text-fg-muted leading-relaxed">
          A polished card, anchored beside the button that asked, that asks for one short string with optional default + description. Same primitive as <code className="font-mono text-fg bg-elevated px-1 rounded">window.prompt</code> but inside the platform&apos;s surface language: rounded card, brand-tinted icon disc, soft gradient header, line + flat aesthetic. <strong>Used everywhere a small input is needed — native <code className="font-mono text-fg bg-elevated px-1 rounded">window.prompt</code> is never used on the platform.</strong>
        </p>
        <SubSection title="Try it">
          <InputDialogPreview />
        </SubSection>
        <SubSection title="API">
          <pre className="text-[11px] font-mono bg-elevated/40 rounded-md p-3 overflow-x-auto leading-relaxed">{`const { inputDialog, node } = useInputDialog();
// ...render \`node\` somewhere in the component tree.

const value = await inputDialog({
  title: "Name this snapshot",          // required
  description: "Optional one-liner",    // optional subhead
  label: "Snapshot name",               // input label (default "Name")
  placeholder: "Before restructuring",
  defaultValue: "",
  confirmLabel: "Snapshot",             // button text (default "Save")
  cancelLabel: "Cancel",
  allowEmpty: false,                    // accept "" trimmed?
  maxLength: 200,
  icon: Pencil,                         // override the icon
});
if (value === null) return; // user cancelled (X / Escape / backdrop)`}</pre>
        </SubSection>
        <SubSection title="Behaviour">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>• Autofocus + select the input on open so the user can type immediately.</li>
            <li>• <strong>Enter</strong> confirms (when valid). <strong>Escape</strong>, backdrop click, and the <strong>×</strong> button all cancel.</li>
            <li>• Disables confirm when input is empty (unless <code className="font-mono text-fg bg-elevated px-1 rounded">allowEmpty</code> is set).</li>
            <li>• Promise resolves to the entered string (trimmed unless <code className="font-mono text-fg bg-elevated px-1 rounded">allowEmpty</code>), or <code className="font-mono text-fg bg-elevated px-1 rounded">null</code> on cancel.</li>
          </ul>
        </SubSection>
      </Section>

      <Section icon={AlertTriangle} title="ConfirmDialog — designed replacement for window.confirm" eyebrow="Component · confirm modal">
        <p className="text-sm text-fg-muted leading-relaxed">
          A polished yes/no card, anchored beside the button that asked, that replaces <code className="font-mono text-fg bg-elevated px-1 rounded">window.confirm()</code> (and, with <code className="font-mono text-fg bg-elevated px-1 rounded">acknowledgeOnly</code>, <code className="font-mono text-fg bg-elevated px-1 rounded">window.alert()</code>). Three tones (<code className="font-mono text-fg bg-elevated px-1 rounded">neutral</code>, <code className="font-mono text-fg bg-elevated px-1 rounded">warning</code>, <code className="font-mono text-fg bg-elevated px-1 rounded">destructive</code>) map onto the destructive-confirmation hierarchy above — pick the tone that matches the prompt&apos;s stakes. <strong>ConfirmDialog / ConfirmPopover are used everywhere — native <code className="font-mono text-fg bg-elevated px-1 rounded">window.confirm</code>, <code className="font-mono text-fg bg-elevated px-1 rounded">window.alert</code> and <code className="font-mono text-fg bg-elevated px-1 rounded">window.prompt</code> are never used on the platform.</strong> For irreversible WORK-DESTROYING actions, escalate to <code className="font-mono text-fg bg-elevated px-1 rounded">LaunchSwitch</code> instead.
        </p>
        <SubSection title="Try it — three tones">
          <ConfirmDialogPreview />
        </SubSection>
        <SubSection title="API">
          <pre className="text-[11px] font-mono bg-elevated/40 rounded-md p-3 overflow-x-auto leading-relaxed">{`const { confirmDialog, node } = useConfirmDialog();
// ...render \`node\` somewhere in the component tree.

const ok = await confirmDialog({
  title: "Clear every field on this form?",   // required, phrase as a question
  description: "This wipes your draft. Can't be undone.", // optional subhead
  confirmLabel: "Clear form",                 // default depends on tone
  cancelLabel: "Cancel",                      // default "Cancel"
  tone: "warning",                            // neutral | warning | destructive
  icon: AlertTriangle,                        // optional override
});
if (!ok) return; // user cancelled (X / Escape / backdrop / Cancel)`}</pre>
        </SubSection>
        <SubSection title="Behaviour">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>• <strong>Confirm</strong> autofocuses on open — Enter confirms, Escape cancels, click backdrop or × also cancels.</li>
            <li>• Header gradient + icon disc + confirm-button colour all switch with the tone. Neutral = brand, warning = amber, destructive = rose.</li>
            <li>• Promise resolves to <code className="font-mono text-fg bg-elevated px-1 rounded">true</code> on confirm, <code className="font-mono text-fg bg-elevated px-1 rounded">false</code> on cancel.</li>
            <li>• Uses <code className="font-mono text-fg bg-elevated px-1 rounded">role=&quot;alertdialog&quot;</code> + <code className="font-mono text-fg bg-elevated px-1 rounded">aria-modal</code> + labelled heading + described body for screen readers.</li>
          </ul>
        </SubSection>
        <SubSection title="Tone → use case mapping">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>• <strong>neutral</strong> — routine choices (&quot;Open in a new tab?&quot;, &quot;Apply these AI rewrites?&quot;). Brand-coloured confirm.</li>
            <li>• <strong>warning</strong> — moderate risk, recoverable (&quot;Clear the form?&quot;, &quot;Discard this draft?&quot;). Amber confirm.</li>
            <li>• <strong>destructive</strong> — irreversible but bounded (&quot;Delete this comment thread?&quot;, &quot;Remove this saved posting?&quot;). Rose confirm.</li>
            <li>• <strong>Irreversible WORK-DESTROYING</strong> (hard-delete a resume, wipe a workspace) — don&apos;t use ConfirmDialog. Reach for <code className="font-mono text-fg bg-elevated px-1 rounded">LaunchSwitch</code>, which has the cover-flip + countdown ritual that fits that tier.</li>
          </ul>
        </SubSection>
      </Section>

      <Section icon={Type} title="Voice & tone" eyebrow="Microcopy · how the platform sounds">
        <p className="text-sm text-fg-muted leading-relaxed">
          Canonical doc: <code className="font-mono text-fg bg-elevated px-1 rounded">docs/ux/microcopy.md</code>. Short, opinionated. When in doubt, copy the patterns there.
        </p>
        <SubSection title="Principles in one sentence each">
          <ul className="space-y-1.5 text-sm">
            <li>• <strong>Plain professional</strong> — closer to a respected colleague&apos;s email than a landing page.</li>
            <li>• <strong>You</strong> is the user; <strong>we</strong> is the platform (sparingly).</li>
            <li>• <strong>Imperative</strong> for actions (Save · Apply · Delete · Tailor to posting).</li>
            <li>• <strong>Past tense</strong> for done state (Saved · Submitted on May 12).</li>
            <li>• <strong>No</strong> exclamation marks, no emoji in product UI, no clichés (&quot;passionate&quot;, &quot;dynamic&quot;, &quot;synergy&quot;).</li>
          </ul>
        </SubSection>
        <SubSection title="Empty states — required shape">
          <p className="text-sm text-fg-muted leading-relaxed">
            Every list / index page that can be empty must render: icon (single lucide glyph, 12pt) + headline (one short sentence) + subhead (one short sentence) + primary action. Anti-pattern: bare &quot;No items.&quot;
          </p>
        </SubSection>
        <SubSection title="Error messages — three rules">
          <ul className="space-y-1.5 text-sm">
            <li>1. Say what happened in plain language. No error codes leaked to the user.</li>
            <li>2. Suggest a recovery. &quot;Try again&quot;, &quot;Add a JD first&quot;, &quot;Check your network&quot;.</li>
            <li>3. Don&apos;t blame the user. Frame even input errors as a request.</li>
          </ul>
        </SubSection>
      </Section>

      <Section icon={AlertTriangle} title="Destructive confirmation — three tiers" eyebrow="Safety pattern">
        <p className="text-sm text-fg-muted leading-relaxed">
          Pick the gate that matches how much work is at risk. Don&apos;t stack tiers — that&apos;s ceremony for ceremony&apos;s sake.
        </p>
        <SubSection title="Tier 1 — no gate">
          <p className="text-sm text-fg-muted leading-relaxed">
            Routine, easily reversible. Acts immediately. The action&apos;s own undo / archive / recovery panel is the safety net.
          </p>
          <p className="text-[11px] text-fg-subtle mt-1">Examples: hide a sidebar item, archive a row, remove a single comment.</p>
        </SubSection>
        <SubSection title="Tier 2 — ConfirmDialog">
          <p className="text-sm text-fg-muted leading-relaxed">
            Moderate-risk. Branded yes/no card anchored beside the button — <strong>never</strong> <code className="font-mono text-fg bg-elevated px-1 rounded">window.confirm</code>, which doesn&apos;t fit the design system. Use <code className="font-mono text-fg bg-elevated px-1 rounded">useConfirmDialog()</code> with <code className="font-mono text-fg bg-elevated px-1 rounded">tone=&quot;warning&quot;</code> (for batch ops, reverts, discards) or <code className="font-mono text-fg bg-elevated px-1 rounded">tone=&quot;destructive&quot;</code> (for bounded-but-irreversible actions like deleting a single comment thread). The dialog&apos;s message must state <em>the specific action</em> and <em>its specific impact</em>. Numbers help.
          </p>
          <p className="text-[11px] text-fg-subtle mt-1">Examples: batch operations on N rows, revert to v8, abandon a multi-section draft, clear a form.</p>
        </SubSection>
        <SubSection title="Tier 3 — LaunchSwitch">
          <p className="text-sm text-fg-muted leading-relaxed">
            Irreversible work-destroying. Cover-flip + 10-second countdown + elimination effect is the confirmation. <strong>Never</strong> stack ConfirmDialog on top of a LaunchSwitch — pick one. See the LaunchSwitch section below for the component.
          </p>
          <p className="text-[11px] text-fg-subtle mt-1">Examples: hard-delete a resume or job folder, wipe a workspace.</p>
        </SubSection>
      </Section>

      <Section icon={Rocket} title="LaunchSwitch — clear-cover delete switch" eyebrow="Component · safety pattern">
        <p className="text-sm text-fg-muted leading-relaxed">
          A pulsing, glowing red <strong>DELETE</strong> button sits at all times under a transparent glass cover. The glow is visible through the cover so the affordance reads as &quot;warning, but protected.&quot; To commit: click the cover (it hinges up), click the now-exposed button (10-second countdown starts), wait it out. To bail: close the cover at any point.
        </p>
        <p className="text-[11px] text-fg-subtle italic">
          Ships in <strong>three variants</strong>. <code>LaunchSwitch</code> is the current canonical control — clear glass cover, neon-glow DELETE, 10-second cool-off. <code>LaunchSwitchClassic</code> is the original military rocket-launch design — hazard-striped cover, red FIRE button, 5-second countdown. <code>LaunchSwitchFacet</code> is a new faceted plastic-cover variant — four triangle facets with fixed top-left light source, reflection/seam geometry baked into the surface. All three share the same prop API. Companion HTML exploration with twelve cover geometries lives at <code>/design-archive/delete-buttons-prism-covers.html</code>.
        </p>
        <p className="text-sm text-fg-muted leading-relaxed">
          Two-stage destructive control inspired by the protected red switches on a jet fighter&apos;s weapons panel.
          Reach for it any time a single accidental click would be costly to undo — hard-delete a row, abandon a draft, wipe a workspace.
        </p>

        <SubSection title="States">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-line bg-elevated/40 p-4 flex flex-col items-center gap-3">
              <LaunchSwitchDemo />
              <p className="text-[11px] text-fg-muted text-center">
                <span className="font-bold text-fg">Closed</span> · glass cover sits over the glowing DELETE button. Glow pulses through. Click the cover to lift.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-elevated/40 p-4 flex flex-col items-center gap-3">
              <LaunchSwitchDemo />
              <p className="text-[11px] text-fg-muted text-center">
                <span className="font-bold text-fg">Armed</span> · cover hinged 82°, DELETE exposed + clickable. Click the cover (or its hinge area) to bail.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-elevated/40 p-4 flex flex-col items-center gap-3">
              <LaunchSwitchDemo />
              <p className="text-[11px] text-fg-muted text-center">
                <span className="font-bold text-fg">Launching → Eliminated</span> · &quot;Deleting in 10&quot; ticks down once per second with a flashing LED. At 0 the chassis goes matte black, a red strike-through slams across the word DELETED, a CRT scan-line travels the panel, the text&apos;s letter-spacing blows out, and a final white-bar flash collapses to nothing — the whole &quot;eliminated&quot; sequence runs ~2s before <code>onFire()</code>. The host card uses this window to play its own outro animation.
              </p>
            </div>
          </div>
        </SubSection>

        <SubSection title="Sizes">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex flex-col items-center gap-2">
              <LaunchSwitchDemo />
              <code className="text-[11px] text-fg-muted">size=&quot;sm&quot; · 132×30</code>
            </div>
            <div className="flex flex-col items-center gap-2">
              <LaunchSwitchMediumDemo />
              <code className="text-[11px] text-fg-muted">size=&quot;md&quot; · 180×44</code>
            </div>
          </div>
        </SubSection>

        <SubSection title="Variants — pick by surface">
          <p className="text-sm text-fg-muted leading-relaxed">
            All three share the same prop API. Pick by how industrial vs. product-design the surface wants to feel: glass-cover is soft and modern; facet is a moulded plastic-prism middle ground; classic is hazard-stripe industrial.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mt-2">
            <div className="rounded-xl border border-line bg-elevated/40 p-5 flex flex-col items-center gap-3">
              <div className="flex items-center gap-6">
                <LaunchSwitchDemo />
                <LaunchSwitchMediumDemo />
              </div>
              <div className="text-center">
                <p className="text-[12px] font-semibold text-fg">LaunchSwitch (current)</p>
                <p className="text-[11px] text-fg-muted mt-0.5">Clear glass cover, neon-glow DELETE underneath, 10-second cool-off. 132×30 (sm) / 180×44 (md).</p>
                <code className="text-[10px] text-fg-subtle font-mono">@/components/ui/LaunchSwitch</code>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-elevated/40 p-5 flex flex-col items-center gap-3">
              <div className="flex items-center gap-6">
                <LaunchSwitchFacetDemo />
                <LaunchSwitchFacetMediumDemo />
              </div>
              <div className="text-center">
                <p className="text-[12px] font-semibold text-fg">LaunchSwitchFacet (new)</p>
                <p className="text-[11px] text-fg-muted mt-0.5">Opaque plastic cover carved into four triangular facets meeting at the centre. Fixed top-left light source, diagonal seams visible. 132×30 (sm) / 180×44 (md).</p>
                <code className="text-[10px] text-fg-subtle font-mono">@/components/ui/LaunchSwitchFacet</code>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-elevated/40 p-5 flex flex-col items-center gap-3">
              <div className="flex items-center gap-6">
                <LaunchSwitchClassicDemo />
                <LaunchSwitchClassicMediumDemo />
              </div>
              <div className="text-center">
                <p className="text-[12px] font-semibold text-fg">LaunchSwitchClassic (original)</p>
                <p className="text-[11px] text-fg-muted mt-0.5">Hazard-striped cover, red FIRE button under, 5-second countdown, rivet corners. 118×26 (sm) / 160×38 (md).</p>
                <code className="text-[10px] text-fg-subtle font-mono">@/components/ui/LaunchSwitchClassic</code>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-fg-muted mt-3">
            For further cover-geometry exploration (twelve cover styles — faceted pyramid, chamfered bezel, fresnel, octagon-stamped, refracted prism, hex-faceted lens, …) see <a href="/design-archive/delete-buttons-prism-covers.html" target="_blank" rel="noopener" className="underline hover:text-fg">delete-buttons-prism-covers.html</a> in the design archive.
          </p>
        </SubSection>

        <SubSection title="When to reach for it">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>• Hard-delete a row (vs. soft-archive) — the irreversible cousin of Archive.</li>
            <li>• Abandon a draft, wipe a workspace, reset a long-form editor.</li>
            <li>• Anywhere a one-click button would be too cheap given the cost of an accidental press.</li>
          </ul>
          <p className="text-[11px] text-fg-subtle mt-2">
            <strong>Don&apos;t</strong> use it for routine destructive actions (delete one comment, remove one row from a list of many). Reserve the cover-flip drama for actions that cost real work to undo — otherwise it becomes ceremony for ceremony&apos;s sake.
          </p>
        </SubSection>

        <SubSection title="Props (shared by all three variants)">
          <pre className="text-[11px] font-mono bg-elevated/40 rounded-md p-3 overflow-x-auto leading-relaxed">{`<LaunchSwitch          // or <LaunchSwitchFacet /> or <LaunchSwitchClassic />
  label="DELETE"            // text on the cover; default "DELETE"
  countdownSeconds={10}     // T-minus before onFire runs.
                            //  • LaunchSwitch / Facet default: 10
                            //  • LaunchSwitchClassic default:    5
  size="sm" | "md"          // glass / facet: 132×30 / 180×44
                            // classic:       118×26 / 160×38
  actionVerb="Deleting"     // word during countdown ("Wiping", etc.)
  onArm={() => {}}          // optional — fires when cover lifts
  onAbort={() => {}}        // optional — fires when user cancels
  onFire={() => {}}         // required — runs once countdown hits 0
/>`}</pre>
        </SubSection>
      </Section>

      <Section icon={Wand2} title="MasterTailorDrawer — AI tailor from the master library" eyebrow="Component · drawer">
        <p className="text-sm text-fg-muted leading-relaxed">
          Right-anchored drawer that wires the AI tailor flow for a tailored resume. Triggered by the <strong>AI tailor for this role</strong> button in <code className="text-[11px]">MasterResumeBanner</code>. Three deliberate steps so the user always knows where they are:
        </p>
        <SubSection title="The three steps">
          <ol className="space-y-2 text-sm text-fg-muted list-decimal pl-5">
            <li><span className="font-semibold text-fg">Input.</span> Tabs between &quot;Paste a JD&quot; (textarea, 40-char minimum) and &quot;Pick a posting&quot; (filterable list of active + saved postings). Confirm with <strong>Find my best bullets</strong>.</li>
            <li><span className="font-semibold text-fg">Loading.</span> Single full-height spinner — &quot;Reading the JD + searching your N-bullet library…&quot;. Server: embed JD → cosine-rank ≤30 → LLM pick + light-rewrite. ~3–6s on a warm provider.</li>
            <li><span className="font-semibold text-fg">Review.</span> Suggestions grouped by section. Each row: checkbox (default checked) · anchor chip · original/rewrite side-by-side diff (editable rewrite column) · <strong>Why this bullet?</strong> expand with similarity %. Footer: Back · Cancel · Accept N selected.</li>
          </ol>
        </SubSection>
        <SubSection title="The two endpoints">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>• <code className="text-[11px]">POST /api/profile/resume/master/ai-tailor</code> — preview-only. Returns <code className="text-[11px]">suggestions[]</code> with bulletId, original, rewritten, reason, anchor, similarity. Nothing written.</li>
            <li>• <code className="text-[11px]">POST /api/profile/resume/master/ai-tailor/apply</code> — accepts the user&apos;s subset, finds/creates the matching section + item by anchor, inserts each bullet with <code className="text-[11px]">aiSuggested: true</code> and <code className="text-[11px]">derivedFromMasterBulletId</code>. One revision tagged <code className="text-[11px]">triggeredBy: &quot;ai_tailor&quot;</code>.</li>
          </ul>
        </SubSection>
        <SubSection title="The five AI rules (system prompt)">
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>• Pick ONLY from existing master bullets — never invent.</li>
            <li>• Don&apos;t add facts, numbers, tools, or experiences not in the original bullet.</li>
            <li>• Rewrites are LIGHT — vocabulary matches only; never change the underlying claim.</li>
            <li>• Pick at most N (default 12). Fewer is fine if only fewer are relevant.</li>
            <li>• Each pick must have a concrete JD-grounded reason.</li>
          </ul>
          <p className="text-[11px] text-fg-subtle italic mt-2">
            Provider stack: Gemini Flash primary, Cloudflare Llama fallback (via <code>chat()</code>). Embeddings: Cloudflare bge-small-en-v1.5 384d (via <code>embed()</code>). Full prompt language in <code>src/lib/resume/master-tailor.ts</code>.
          </p>
        </SubSection>
      </Section>
    </div>
  );
}

/* ─── atoms ──────────────────────────────────────────────────── */

function Section({
  icon: Icon, title, eyebrow, children,
}: { icon: React.ElementType; title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6 surface-shadow">
      <header className="mb-5">
        <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-subtle">{eyebrow}</p>
        <h2 className="text-lg font-bold text-fg tracking-tight mt-1 inline-flex items-center gap-2">
          <Icon size={16} className="text-brand-600" />
          {title}
        </h2>
      </header>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-subtle mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SurfaceSwatch({ name, cls, caption }: { name: string; cls: string; caption: string }) {
  return (
    <div className={`rounded-xl p-4 border border-line ${cls}`}>
      <p className="text-sm font-bold">{name}</p>
      <p className="text-[10px] font-mono opacity-70 mt-1">{caption}</p>
    </div>
  );
}

function BrandSwatch({ step }: { step: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-full h-12 rounded-md bg-brand-${step} border border-line`} />
      <p className="text-[10px] font-mono text-subtle">{step}</p>
    </div>
  );
}

function StatusSwatch({ label, chip, example }: { label: string; chip: string; example: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3 flex items-center justify-between gap-3">
      <p className="text-xs text-muted">{label}</p>
      <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${chip}`}>
        {example}
      </span>
    </div>
  );
}

function TypeRow({ size, children }: { size: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-line/60 pb-2 last:border-0">
      <span className={`${size} text-fg`}>{children}</span>
      <code className="ml-auto text-[10px] font-mono text-subtle">{size}</code>
    </div>
  );
}

function ShadowBox({ label, cls }: { label: string; cls: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`w-full h-16 bg-card rounded-xl ${cls}`} />
      <p className="text-[10px] font-mono text-subtle">{label}</p>
    </div>
  );
}

function BannerExample({
  tone, icon: Icon, title, body,
}: { tone: "info" | "warning" | "error" | "success"; icon: React.ElementType; title: string; body: string }) {
  const styles: Record<typeof tone, string> = {
    info: "bg-brand-50 ring-brand-200 text-brand-900",
    warning: "bg-amber-50 ring-amber-200 text-amber-900",
    error: "bg-rose-50 ring-rose-200 text-rose-900",
    success: "bg-emerald-50 ring-emerald-200 text-emerald-900",
  };
  const iconCol: Record<typeof tone, string> = {
    info: "text-brand-700",
    warning: "text-amber-700",
    error: "text-rose-700",
    success: "text-emerald-700",
  };
  return (
    <div className={`rounded-2xl ring-1 ring-inset p-4 flex items-start gap-3 ${styles[tone]}`}>
      <Icon size={18} className={`shrink-0 mt-0.5 ${iconCol[tone]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs leading-relaxed mt-1 opacity-85">{body}</p>
      </div>
    </div>
  );
}

/** Sample nav-row used by the Queue badges swatch. Mirrors the
 *  shape rendered by Sidebar → NavLink so the swatch reads as a
 *  true-to-life preview, not a custom illustration. */
function NavRowDemo({ label, count }: { label: string; count: number }) {
  const badgeText = count === 0 ? null : count > 99 ? "99+" : String(count);
  const tone =
    count >= 6
      ? "bg-rose-600 text-white"
      : "bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-200";
  return (
    <div className="inline-flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-line text-sm min-w-[200px]">
      <span className="flex-1 truncate text-fg font-medium">{label}</span>
      {badgeText ? (
        <span className={`shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ${tone}`}>
          {badgeText}
        </span>
      ) : (
        <span className="text-[10px] text-subtle italic">no badge</span>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: "emerald" | "violet" | "amber" | "rose" | "slate"; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    violet: "bg-violet-100 text-violet-800 ring-violet-200",
    amber: "bg-amber-100 text-amber-800 ring-amber-200",
    rose: "bg-rose-100 text-rose-800 ring-rose-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded-full ring-1 ring-inset ${styles[tone]}`}>
      {children}
    </span>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0">
        <code className="font-mono text-fg bg-elevated px-1.5 py-0.5 rounded text-[11px]">{k}</code>
      </dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

function A11yItem({ ok, todo, children }: { ok?: boolean; todo?: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  const color = ok ? "text-emerald-700" : todo ? "text-amber-700" : "text-subtle";
  return (
    <li className="flex items-start gap-2">
      <Icon size={13} className={`shrink-0 mt-0.5 ${color}`} />
      <span className="text-muted">{children}</span>
    </li>
  );
}
