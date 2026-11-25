<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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

# Mandatory integration for future content-review features

Every new or changed content-review feature must use the shared reviewer feedback history. This includes comments, replies, corrections, decisions, questions, review rounds and approval/OK actions.

- Read `docs/workspace/reviewer-feedback-learning.md` and `config/review-feedback-sources.json` before implementing a review feature.
- Reuse registered storage and review services where possible; its history is captured automatically. Register the feature's review surfaces and workflow in the source registry.
- New storage requires an explicit source registration, a dedicated capture migration/adapter, and a fixture in `tests/integration/review-feedback-storage.py`. Include create/edit/delete, context, actor uncertainty and rollback coverage.
- Every new Prisma model must be classified. For models outside editorial review, add a specific reason to `excludedModels`; do not enlarge the frozen non-content baseline. Keep applicant/personnel/learner assessments outside editorial preference learning unless explicitly authorized.
- Preserve exact source evidence and older versions. Separate review actions from style evidence, keep preferences scoped by project, and retain unknown attribution explicitly. Review @mentions use in-page notifications and existing replies.
- Run `npm run check:review-feedback` and `npm run test:review-feedback`; the production build and blocking CI gate enforce registration and PostgreSQL fixture coverage. A new review feature is incomplete until these pass.
