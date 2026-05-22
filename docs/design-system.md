# BHN Training Platform — Design System

**Version 1.0 · Companion to the live page at `/admin/design-system`**

The system isn't aspirational — it's a name for what's already in the code. Every token, scale, and pattern here is referenced by at least one component in `src/components/` and rendered by at least one route under `src/app/`. The live `/admin/design-system` page imports these primitives directly, so this doc and the running app cannot drift.

---

## Surfaces

The platform has five named surface layers. Each carries an implicit z-index and elevation contract.

| Surface | Token (Tailwind) | When to use |
|---|---|---|
| **Page** | `bg-bg`, `text-fg` | The root canvas. Body backgrounds, hero blocks. |
| **Card** | `bg-card`, `surface-shadow` | The default container for content. Borders sit on `border-line`. |
| **Elevated** | `bg-elevated` | Subtle lift inside a card — list rows on hover, sub-sections inside a card. Usually inset `border-line`. |
| **Popover** | `popover` (utility class) | Dropdowns, theme picker, tooltips. Rounded `xl`, shadowed, z-30. |
| **Overlay** | `bg-backdrop` | Mobile drawer scrim and modal backdrops. z-40 for backdrop, z-50 for modal content. |

The `glass` utility is a special case: same fill as the page but with a subtle blur/translucency. Used for the sidebar and the global header strip.

---

## Color tokens

The brand scale is defined per theme in `src/components/ui/ThemeProvider.tsx` and consumed via Tailwind utilities. Themes swap the values; usage stays constant.

### Brand scale

| Token | Use |
|---|---|
| `brand-50` | Soft background tint, banner fills, focused row backgrounds |
| `brand-100` | Hover state for soft fills |
| `brand-200` | Ring/outline on focused cards |
| `brand-400` | Border on selected items |
| `brand-500` | Focus ring (`focus:ring-brand-500/30`) |
| `brand-600` | Primary action — buttons, links, primary icons |
| `brand-700` | Hover state for primary action; primary text on light fill |
| `brand-800` / `900` | Strong text on soft brand-tinted backgrounds |

### Semantic colors

| Token | Use |
|---|---|
| `fg`, `text-fg` | Primary text |
| `muted`, `text-muted` | Secondary text, descriptions |
| `subtle`, `text-subtle` | Tertiary text, eyebrow labels, hints |
| `line`, `border-line` | Default border; consistent across themes |
| `bg`, `card`, `elevated` | Surface fills (see Surfaces above) |

### Status palettes

Used for status chips, banners, and feedback states. Each has a fill / text / ring triple:

| Status | Fill / Text / Ring |
|---|---|
| Success / confirmed | `bg-emerald-50` / `text-emerald-800` / `ring-emerald-200` |
| Pending / approval | `bg-violet-100` / `text-violet-800` / `ring-violet-200` |
| Waitlist / warning | `bg-amber-50` / `text-amber-800` / `ring-amber-200` |
| Error / destructive | `bg-rose-50` / `text-rose-800` / `ring-rose-200` |
| Neutral / cancelled | `bg-slate-100` / `text-slate-700` / `ring-slate-200` |

---

## Type scale

Tailwind-native classes, applied directly.

| Token | Use |
|---|---|
| `text-[10px] uppercase tracking-[0.22em] font-bold` | Eyebrow / section label |
| `text-[11px]` | Metadata / inline labels |
| `text-xs` (12px) | Captions, helper copy |
| `text-sm` (14px) | Body copy, form inputs |
| `text-base` (16px) | Body emphasis, list items |
| `text-lg` (18px) | Sub-section titles |
| `text-xl` (20px) | Card titles |
| `text-2xl sm:text-3xl font-bold tracking-tight` | Page H1 |

`font-mono tabular-nums` is reserved for numerics that need to align (credit balances, capacity counters, QR tokens).

---

## Radius scale

The platform's "voice" varies by theme — each theme picks its own radius scale via CSS variables. The defaults below are the `light` theme baseline; other themes may override.

| Token | Pixel value (light) | Use |
|---|---|---|
| `rounded` | 4px | Inline chips |
| `rounded-md` | 6px | Small badges, status pills |
| `rounded-lg` | 8px | Standard form controls, inline cards |
| `rounded-xl` | 12px | Buttons, popover items, banners |
| `rounded-2xl` | 16px | Cards, hero blocks, large surfaces |
| `rounded-full` | 9999px | Avatars, status chips, the credits pill |

The `retro8bit` theme overrides every radius to `0px`. The `icecream` theme bumps everything one tier larger. Don't hard-code px values for corners — always use the scale.

---

## Elevation / shadow scale

| Token | Use |
|---|---|
| `surface-shadow` | Default card shadow — barely visible, just enough to separate from background |
| `shadow-sm` | Inline chips, small floats |
| `shadow-md` | Buttons (especially primary), modal corners |
| `shadow-lg` | Popover, dropdown, theme picker |
| `shadow-xl` | Reserved for full modal panels |

Never combine `shadow-` and a `ring-` — pick one. Rings own focus + selection states; shadows own elevation.

### Named shadows

The platform also ships a set of **semantic** shadow utilities. Each one
is a single CSS variable composed in `@theme inline` (geometry) plus
per-theme `*-tint` / `*-near` / `*-far` variables (hue + alpha) so the
same utility breathes correctly across all 13 themes. Reach for these
before adding an arbitrary `shadow-[…]` — the ESLint rule
[`no-restricted-syntax` in `eslint.config.mjs`](../eslint.config.mjs)
blocks hard-coded colour shadows at the error level.

| Token | Visual purpose |
|---|---|
| `shadow-card-rest` | Resting state of any `<Card>` — aliases the theme's `--surface-shadow` so existing per-theme calibration (mist inset highlight, hitech cyan ring, coldbrew ceramic specular, …) carries over verbatim. |
| `shadow-card-hover` | Lifted state of a `<Card hover>`. Heavier than the rest shadow; per-theme `--shadow-card-hover-near` / `-far` decide the hue. |
| `shadow-elevated-panel` | Heavy drop for a panel that wants to read as floating above the page — employer cover banner, committee badge strip, small simulator modal, rewards distance card. |
| `shadow-elevated-modal` | The big modal shadow — used by the job-dynamics briefing dialog. Heavier than `shadow-elevated-panel` and more saturated on dark themes. |
| `shadow-lifted` | Control-panel chip floating above content — Course Filters dark strip. |
| `shadow-lifted-strong` | Dramatic hover-lift for tools that scale on hover (LoginFloaters editor zoom). |
| `shadow-pedestal` | White circular / square logo holder. Composite of a heavy drop + an inset `1px` top highlight that makes the holder feel embossed — used in the employer cover and `DSPageHeader` brand-mark slot. |
| `shadow-medal` | Committee badge medal — drop + inset shine that simulates a brushed-gold disc. |
| `shadow-banner-amber` | The `ImpersonationBanner` pill — small amber-rim glow that signals "viewing-as" without competing with the page CTA. |
| `shadow-spotlight` | Onboarding spotlight scrim. Renders a 9999 px outer shadow that darkens the entire viewport except the ring around the highlighted element. |
| `shadow-glow-preview-violet` | Sidebar preview-mode container — superadmin "peek as HR" affordance. Soft violet halo, brighter than surrounding sections so it's instantly spottable. |
| `shadow-glow-amber` | Subtle amber halo for an idle filter chip. |
| `shadow-glow-amber-strong` | Loud amber halo for the **active** state — featured-courses toggle, sidebar external-highlight pulse. |
| `shadow-glow-amber-bar` | Inner glow on the rewards progress bar fill (no negative spread — falloff carries further than the chip variants). |
| `shadow-glow-white-marker` | "You-are-here" marker on the rewards progress bar — bright, narrow white halo. |
| `drop-shadow-glow-brand` | Logo-mark glow. Brand-tinted by default, retuned per theme (dryice gets cyan, hitech gets electric cyan, …). |
| `drop-shadow-glow-brand-strong` | The bigger / louder variant used on the login hero mark. |
| `drop-shadow-on-dark-sm` | Light cushion for small text sitting on a dark hero or banner (`DSStatGrid` stat values when `onDark`, `GreetingTagline` dark tone). |
| `drop-shadow-on-dark` | Standard text cushion for medium-size numerics on dark surfaces (dashboard hero stat numbers, `RewardsDistanceCard`). |
| `drop-shadow-on-dark-lg` | Big-headline / big-numeric cushion (rewards page hero stat, login hero headline). |

> **Per-theme tuning.** Tints for dark themes (hitech, dryice, chilli,
> coldbrew, aurora) live alongside their existing `--surface-shadow`
> blocks at the bottom of `globals.css`. If a shadow looks identical
> in Daylight and Voltage / Dry Ice, re-tune the per-theme tint
> variables until the dark theme's shadow actually breathes against
> its canvas. Light / pastel themes (rosalind, mist, sakura, salty,
> greenwood, atompunk, icecream) inherit the Daylight defaults from
> `:root`.

> **Genuine exceptions.** If a shadow's geometry is genuinely
> animation-locked (the LaunchSwitch cover-flip + countdown timeline
> is the only current example), suppress with a **line-level**
> `// eslint-disable-next-line no-restricted-syntax` plus a one-line
> comment explaining WHY a token wouldn't work.

---

## Motion primitives

All custom keyframes live in `src/app/globals.css` and respect `@media (prefers-reduced-motion: reduce)`.

| Animation | Use |
|---|---|
| `animate-fade-in` | Popover appear; modal mount |
| `animate-roll-x` | Theme picker description scrolling on hover |
| `admin-glow` | Admin-only action buttons — cyan/white pulsing ring. Signals "this is the destructive / high-stakes button." |
| `animate-pulse` | Loading skeletons; not for attention-grabbing |

**Idle motion budget:** at most ONE animated element on the page should be in motion at idle. The EXPERIENCE guide deliberately stops idle animations after 30 seconds.

**Hover motion:** small, fast (150–200ms), easing `ease-out`. The roll-x scroll is the exception — slow enough to be readable.

---

## Spacing rhythm

The platform uses Tailwind's default spacing scale with two strong conventions:

- **Vertical rhythm.** Stack spacing inside a card defaults to `space-y-3` (12px). Between sections defaults to `space-y-6` (24px). Page-level sections use `space-y-8` to `space-y-12`.
- **Inline rhythm.** Form rows: `gap-3`. Button groups: `gap-2`. Inline metadata strips: `gap-x-3 gap-y-1`.

---

## Component patterns

### Buttons

| Variant | Classes |
|---|---|
| **Primary** | `bg-brand-600 text-white hover:bg-brand-700 rounded-xl px-4 py-2 text-sm font-bold shadow-md shadow-brand-600/25` |
| **Secondary** | `border border-line bg-card text-fg hover:bg-elevated rounded-xl px-4 py-2 text-sm font-bold` |
| **Ghost** | `text-muted hover:text-fg hover:bg-elevated rounded-xl px-3 py-2 text-sm` |
| **Destructive** | `bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 rounded-xl px-3 py-2 text-xs font-bold` |
| **Approval** (admin) | `bg-emerald-600 text-white hover:bg-emerald-700 admin-glow rounded-xl px-3 py-2 text-xs font-bold` |
| **Pending** (user) | `bg-violet-600 text-white hover:bg-violet-700 rounded-lg px-3 py-1.5 text-xs font-bold` |

Disabled state on every variant: `disabled:opacity-50 disabled:cursor-not-allowed`.

### Banners

Four sentiments, all share the same skeleton: `rounded-2xl ring-1 ring-inset p-4 sm:p-5 flex items-start gap-3`.

| Sentiment | Fill / ring / icon color |
|---|---|
| Info | `bg-brand-50` / `ring-brand-200` / icon `text-brand-700` |
| Warning | `bg-amber-50` / `ring-amber-200` / icon `text-amber-700` |
| Error | `bg-rose-50` / `ring-rose-200` / icon `text-rose-700` |
| Success | `bg-emerald-50` / `ring-emerald-200` / icon `text-emerald-700` |

The pending-approval banner on the symposium registration form is the canonical Warning example.

### Form fields

Single source of truth:
```
w-full bg-card border border-line rounded-lg px-3 py-2 text-sm text-fg
placeholder:text-subtle
focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500
disabled:opacity-60
```

Textareas add `resize-y`. Selects look the same but get a chevron icon.

### Status chips

```
inline-flex items-center text-[10px] font-bold uppercase tracking-[0.16em]
px-2 py-0.5 rounded-full ring-1 ring-inset
```

Then a status palette (see "Status palettes" above). Always uppercase, always tracking-[0.16em].

### Queue badges (new, May 2026)

Small numeric chip stamped next to a nav-row label when a queue behind that route has items pending the role's attention. Surfaces the workload at a glance — no click required.

```
shrink-0 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5
rounded-full text-[10px] font-bold tabular-nums
```

Severity-tonal:

| Pending count | Fill | Text | Rationale |
|---|---|---|---|
| 0 | *(no chip rendered)* | — | Absence is the signal — "nothing pending". |
| 1–5 | `bg-brand-100` + `ring-brand-200` | `text-brand-800` | Informational — there's some work, not urgent. |
| 6+ | `bg-rose-500` | `text-white` | Queue is piling up; nudge the operator. |
| 100+ | *(rendered as `99+`)* | — | Visual stability — never overflow the chip width. |

**Urgent-from-one keys** (trainee-side "someone's waiting on you" items — incoming interview request, offer waiting, buddy invite) flip straight to the rose chip on any count ≥ 1 AND add a soft pulse (`animate-nav-badge-pulse`). These are time-sensitive on the trainee's calendar; the platform shouldn't bury them in an informational tone. The whitelist lives in `URGENT_FROM_ONE` inside `src/components/lms/Sidebar.tsx`.

**Where it lives.** The pattern is implemented by passing a `queueCounts: Record<string, number>` map into the Sidebar component. Each `NavItem` can carry an optional `badgeKey: string`; when the count for that key is > 0, the chip renders. The map is populated in `src/lib/admin/queue-counts.ts` (server-side, called from `DashboardLayout` only when the effective role can act on the queues).

**Adding a new badge.** Three steps:
1. Add the count query to `getAdminQueueCounts()` in `src/lib/admin/queue-counts.ts`.
2. Add the key to the `QueueBadgeKey` union there.
3. Set `badgeKey: "<your-key>"` on the matching `NavItem` in `src/components/lms/Sidebar.tsx`.

Don't badge "informational" items (a count of total users, posted internships, etc.) — only badge queues where 0 is the desired state and any positive number is an action the role can take. Otherwise the chip loses its "this needs me" signal.

---

## Accessibility patterns

- **Focus rings.** Every interactive element shows a `focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500` on keyboard focus.
- **`prefers-reduced-motion`** is respected by every keyframe in `globals.css`. Reduced-motion users get static state for `admin-glow`, `roll-x`, and the EXPERIENCE-guide curves.
- **Color is never the only signal.** Status chips combine fill + icon shape + text. Capacity meters combine bar fill + number.
- **Keyboard shortcuts.** `x` toggles trainee view; `xx` (double-tap) toggles HR view. Both gated to superadmin.
- **Skip links.** The dashboard layout starts with a visually-hidden "Skip to main content" link.

The full a11y audit lives at `/admin/design-system` under the "Accessibility checklist" section, refreshed per release.

---

## How to extend this system

1. **Add the token before the component.** New color / radius / shadow needed? Add the token to this doc + the live page first; then use it.
2. **Reuse before invent.** If an existing variant works at 90%, lean on it — don't create a near-duplicate.
3. **No magic px values for corners or shadows.** Always go through the scale.
4. **Document on the live page.** New patterns get a swatch on `/admin/design-system` so they're discoverable by the next contributor.

---

*Last revised: 2026-05-13. The live mirror is at `/admin/design-system` — that page imports from the same Tailwind tokens this doc names, so they can't disagree.*
