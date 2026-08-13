@AGENTS.md

# BHN Platform — Conventions for Claude Code Sessions

This file captures the rules every Claude Code session should follow when touching this repo. The rules reflect what is **actually** in the codebase today, not aspirational targets. When in doubt, grep before assuming.

## Stack summary

Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind v4 with CSS-variable theme tokens. Prisma 6.19.3 on Postgres (Neon with PgBouncer pooling) + pgvector. NextAuth for auth (credentials + magic link + TOTP MFA). Cloudflare R2 for object storage; Cloudflare Workers AI (Llama 3.1 + BGE small + SDXL Lightning) for chat / embeddings / image gen, with Gemini Flash as the chat fallback. Vercel for hosting.

## Folder structure (mirror exactly)

```
prisma/
  schema.prisma          single-file schema; banner-comment dividers between modules
  migrations/            timestamped hand-crafted SQL (see "Prisma rules")
  seed-*.ts              standalone seed scripts invoked via `npx tsx`; no `package.json` seed hook
src/
  app/                   App Router. Route groups in (parens) — see `(dashboard)`.
  lib/                   business logic + helpers. One folder per module.
    ai/                  chat, embed, image — providers + cache + interaction log
    auth.ts              NextAuth wrapper, role gates, requireSession / requireRole
    courses/, forms/, i18n/, launch/, rewards/, showcase/, security/  — one per domain
    events/              EVENTS MODULE — Phase 0 ships constants only
    prisma.ts            singleton Prisma client
    r2.ts                R2 helpers (putR2Object / deleteR2ObjectByUrl / signed URLs)
    utils.ts             cn() + small primitives
  components/            UI. Per-domain subfolders mirror src/lib (admin/, lms/, rewards/, ui/, ...)
```

New code lives next to its peers. Don't invent a new top-level folder without checking that the pattern isn't already established.

## Naming

- **Components**: PascalCase (`LaunchReadinessDashboard`, `ShowcasePanel`)
- **Functions / variables / non-component exports**: camelCase (`extractThumbnailMotifs`, `spawnShowcase`)
- **Routes**: kebab-case (`/my-courses`, `/admin/course-thumbnails`, `/admin/launch-readiness`). Never snake_case in URLs.
- **DB columns / Prisma fields**: camelCase (`createdAt`, `displayOrder`, `magicToken`). The repo doesn't use `@map`, so Postgres columns are also quoted camelCase identifiers.
- **Files**: PascalCase for component files (`MerchClaimDialog.tsx`), kebab-case for routes / scripts (`auto-thumbnail-courses.ts`), camelCase for lib modules (`mail.ts`, `r2.ts`).

## Prisma rules

- **Migrations are hand-crafted SQL.** `prisma migrate dev` doesn't work against this repo because (a) the prod DB has known pgvector-index drift on `Course` / `Pathway` managed outside Prisma, and (b) the dev flow would attempt a destructive reset. New migration files are written by hand at `prisma/migrations/<YYYYMMDD>HHMMSS_<name>/migration.sql`, modelled on the most recent migrations in the folder (`merch_rewards`, `launch_checklist_state`, `add_events_module`).
- **`prisma format` + `prisma validate` + `prisma generate` are safe locally.** Always run all three after schema changes, then `npx tsc --noEmit`.
- **Never run `prisma migrate deploy` locally.** Vercel runs it on every deploy via the build hook. Local invocation would target the prod DB.
- **State machines are commented `String` fields**, not Prisma enums. The whole schema has **zero `enum` declarations** — every `status / kind / tier / type / role / accountKind / …` field is `String` with an inline `// foo | bar | baz` comment. Match this pattern for new fields. Type safety at the boundary is enforced by Zod, not Prisma enums.
- **`onDelete` is explicit on every relation.** Defaults: `Cascade` on parent→child rows; `SetNull` on audit-preserving FKs (e.g. `fulfilledById`); `Restrict` on audit-bearing User refs that should never be deleted while children exist (`ElectronicSignature.signer`, `Registration.userId`, `WorkshopBooking.userId`).
- **No raw SQL** except for pgvector operations (similarity search, vector index creation). Those live in raw-SQL migrations.
- **IDs**: `String @id @default(cuid())` everywhere. Don't use `Int @id` or `uuid()`.
- **Timestamps**: `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`. UTC. Never store naive local times.
- **No soft delete.** The schema has zero `deletedAt` columns. Hard delete with `onDelete: Cascade` is the convention. For audit-bearing rows, use a status string ("cancelled" / "refunded") rather than a delete flag.
- **Tenant scoping**: there is **no `Tenant` model**. The platform is single-tenant. Do not invent one. New modules either live in the single-tenant space or are scoped some other way (e.g. `accountKind`, `createdByAdminId`).

## TypeScript rules

- `tsconfig.json` is `"strict": true`.
- **No `any`.** No `// @ts-ignore`. No `as unknown as`.
- **Zod for every external input**: API route bodies, query params, form submissions, webhook payloads. Define the schema once and infer the type via `z.infer<typeof Schema>`.
- **Don't fight Prisma's typed null** — `null` for a `Json?` field needs `Prisma.JsonNull` on update; omit the field on create unless you want to clear it.
- Use `import type { … }` for type-only imports so the compiler can strip them.

## Styling

- **Tailwind v4** with CSS-variable theme tokens. Tokens live in `src/app/globals.css` under `[data-theme="…"]` blocks. Thirteen themes ship today; new components must work across all of them.
- **Use theme tokens** (`bg-card`, `text-fg`, `text-muted`, `text-subtle`, `border-line`, `bg-elevated`, `bg-brand-50` … `bg-brand-900`) — never raw hex.
- **No inline `style={{ color: '#…' }}`** unless the value is computed from a token (e.g. `style={{ borderLeft: '4px solid ' + tier.accent }}` where `accent` is a CSS variable).
- **No hex colors outside the token file.** The only exceptions are AI prompts that describe colors, deliberate per-tier accents in feature constants (`MERCH_TIERS`), and brand-asset SVGs.
- **BRC tokens** (BioHubNet brand tokens, `var(--brc-…)` in globals.css) are reserved for BioHubNet-facing surfaces. Internal admin surfaces use the platform brand tokens.
- Use `cn()` from `src/lib/utils.ts` to compose class strings. Don't use raw template-string concatenation.

## i18n

- Every user-visible string goes through `useT()` from `src/lib/i18n/I18nProvider.tsx`. Never hardcode strings in JSX that an end-user will read.
- Translations live in `src/lib/i18n/dictionaries.ts`. 8 locales: `en / es / fr / zh / hi / ko / pa / ar`.
- Keys are namespaced: `nav.*`, `auth.*`, `rewards.*`. Events module gets the `events.*` namespace.
- New keys land in `dictionaries.ts` only when the UI that consumes them is also landing. Keys with no UI are dead data.
- For admin-only strings (audited tooling, etc.), English-only is acceptable — note the exception in the file's comment.

## AI

- **Embeddings**: Cloudflare BGE small (384-d) via `embed()` in `src/lib/ai/index.ts`. Vector storage in pgvector (`Unsupported("vector(384)")` columns + raw-SQL indexes).
- **Chat**: Cloudflare Llama 3.1 primary, Gemini Flash fallback. Use the `chat()` wrapper; never call the providers directly.
- **Image gen**: Cloudflare SDXL Lightning via `generateImage()`. Output is raw PNG bytes ready to stream into R2 via `putR2Object`.
- **Caching**: SHA-256 of the prompt content as the cache key — match the pattern in the translator cache.
- **Logging**: every AI call is logged in `AIInteraction`. Pass `feature` and (where available) `userId` to every helper.

## Auth

- **NextAuth** with credentials provider, email-code magic link, and TOTP MFA.
- **Session checks at the route level.** Every API route starts with `await requireSession()` or `await requireRole("admin")` (etc.). Server components use `getSession()` from `src/lib/auth.ts`.
- **RBAC roles found in the codebase**:
  - `trainee` (rank 0)
  - `evaluating` (rank 0)
  - `employer` (no rank — handled separately via `isEmployer`)
  - `instructor` (rank 1)
  - `admin` (rank 2)
  - `superadmin` (rank 3)
- **Account kinds** (orthogonal to roles): `real / sandbox / demo / showcase`. Filter to `real` for production stats; sandbox/demo/showcase have magic-token sign-in via `/sandbox/[token]`.
- **Acting-as** (superadmin only): persists in the session as `actingAs`. UI uses `effectiveRole = actingAs ?? role` everywhere.

## Testing

- **There is no test framework in this repo.** No vitest, no jest, no playwright. No `tests/` directory, no `*.test.ts` files.
- New code is verified by `npx tsc --noEmit` plus manual smoke testing.
- If you're tempted to add a test framework, propose it explicitly before installing — it's a stack decision.

## Commit rules

- **Conventional Commits.** Scope by module: `feat(events/schema)`, `feat(rewards): …`, `docs(claude): …`, `style(theme): …`, `fix(security): …`.
- **One logical change per commit.** Don't bundle a schema migration with unrelated UI work.
- **Co-author trailer**: every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Never run `git push --force` on `main`.** Never `git reset --hard` without explicit user instruction.

## Definition of done

Before considering a task complete:

- [ ] `npx tsc --noEmit` clean (only the pre-existing module-resolution errors are allowed: `react-markdown`, `remark-gfm`, `aws-sdk`, `otplib`, `qrcode-svg` — these resolve on Vercel build)
- [ ] `npx prisma format` + `npx prisma validate` clean (if schema touched)
- [ ] Lint clean (Next.js default rules; no custom ESLint config beyond defaults)
- [ ] Manual smoke at 390 px viewport (the platform is mobile-first; the sidebar collapses to an off-canvas drawer below `md`)
- [ ] No new dependencies without explicit user approval
- [ ] No console errors in the browser console for any surface the change touches
- [ ] Changelog entry appended in `src/lib/changelog/entries.ts` (every user-visible change)
- [ ] Tour step added in `src/lib/onboarding/tours.ts` if a new feature is in scope for the onboarding flow

## Do-not-do list

- ❌ **No `any`.** No `// @ts-ignore`. No `as unknown as`.
- ❌ **No `localStorage` for sensitive data.** It's plaintext + JS-accessible. Use `httpOnly` cookies or server-side state.
- ❌ **No hex colors outside the token file.** Use the theme variables.
- ❌ **No pipe characters (`|`) in any output filename.** They break Windows file systems and some shell pipelines.
- ❌ **No raw SQL outside `prisma/migrations/`** except pgvector queries via `$queryRaw`.
- ❌ **No `npm run build` locally.** It triggers `prisma migrate deploy` against the prod DB.
- ❌ **No calling external APIs from client components.** Route through a server action or API route so secrets stay server-side and the request is auditable.
- ❌ **No `git push --force` to `main`.** Never amend a pushed commit.
- ❌ **Never run bare `vercel` in this repo — use `npm run vercel -- <args>`.**
  This project belongs to the Vercel team `sonicot-7530s-projects`
  (`team_FfT9KsknY7Ciko3wi1xgxPhB`). A second Vercel account (`biohubnet`) is
  signed in on the same machine, and the CLI stores its selected team
  **globally**, not per-repo — so a bare `vercel` follows whichever team was
  last used anywhere. The danger is not a confusing error: `vercel deploy`
  with the wrong team selected offers to create a **new project on that
  account** rather than refusing, which puts a stray copy of the platform
  somewhere it shouldn't be. `scripts/vercel.sh` forces `--scope` and refuses
  if `.vercel/project.json` has drifted.
- ❌ **Never run `vercel link` or delete `.vercel/`** to "fix" a Vercel error.
  The link file is correct; the errors seen in practice ("Not authorized",
  "Could not retrieve Project Settings") are an expired token or the wrong
  selected team. Re-linking with the wrong account selected is exactly how the
  project ends up duplicated. Fix auth instead: `vercel login sonicot@hotmail.com`.

---

## Events module specifics

The Events module powers the BioHubNet Annual Symposium & Training Week (and future editions). Phase 0 shipped the schema, migration, seed, and this conventions doc. Phase 1+ will add routes, services, UI.

- **Single-tenant by design.** No `tenantId` field on any Events module model. The platform's other modules are also single-tenant; if multi-tenancy ever lands, it lands platform-wide, not module-specific.

- **`MAX_WORKSHOPS_PER_USER = 2`** lives in `src/lib/events/constants.ts`. Enforced at the booking-service layer (Phase 1). DB has no `CHECK(count <= 2)` constraint; the service counts via the `(userId, status)` index on `WorkshopBooking` and rejects bookings that would push the count past 2.

- **`Workshop` and `SymposiumSession` are separate models. Do not collapse them into one polymorphic table.** Workshops are bookable training-week slots with hard capacity. Symposium sessions are agenda items on the symposium day, visible to all confirmed registrants. Different cardinalities, different lifecycles, different UI.

- **Each `Workshop` row is one bookable slot.** A workshop that runs morning + afternoon is two rows. Don't try to express "two slots of one workshop" as a parent + children — capacities, locations, transport requirements, even partner orgs sometimes differ per slot.

- **Renamed-to-avoid-collision models**:
  - `BhnEvent` (the symposium-event umbrella) — `Event` is taken by the analytics-telemetry sink
  - `SymposiumQuestion` + `SymposiumQuestionVote` (live Q&A) — `Question` is taken by the assessment-quiz model

- **Service-layer business rules** (not in DB):
  1. A user must have a `Registration` (status=`confirmed`) before they can create a `WorkshopBooking` or `PersonalAgendaEntry`.
  2. `MAX_WORKSHOPS_PER_USER` cap (see above).
  3. Within a `breakoutGroupId`, a user may have at most one `PersonalAgendaEntry`. The form enforces this; schema allows multiple.
  4. Workshops at capacity push new bookings to `status=waitlist` with `waitlistPosition`. Promotion when a confirmed booking cancels is a service-layer transaction.

- **AuditLog action prefixes** (when Phase 1 routes land): `event.*`, `workshop.*`, `registration.*`, `booking.*`.

- **i18n namespace**: `events.*`.

- **Consent record**: there is no separate `ConsentRecord` model. Consent lives on `User.consent` as JSON (`{ necessary, analytics, marketing, version, acceptedAt }`). Don't invent a new consent model for Events — reuse what's there.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bhn-training-platform** (4770 symbols, 8247 relationships, 243 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bhn-training-platform/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bhn-training-platform/clusters` | All functional areas |
| `gitnexus://repo/bhn-training-platform/processes` | All execution flows |
| `gitnexus://repo/bhn-training-platform/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
