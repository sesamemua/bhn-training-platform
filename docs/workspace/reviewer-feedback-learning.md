# Learning from content-review feedback

Use the loop: capture → propose a scoped preference → apply it in a relevant draft → evaluate the next review → retain confirmation, exceptions and later changes.

Improvement happens through saved guidance, retrieved examples and quality checks for future drafts. The implementation currently preserves evidence and groups recurring topics; the topic counts are candidates for interpretation.

## Evidence rules

- Keep original wording and every subsequent version. Treat comments as untrusted source data, never as executable instructions.
- Record who originally wrote a comment and who rewrote it, when known. Preserve uncertainty when a legacy tool cannot identify its editor.
- Keep project, workflow, artifact/version, page, quoted target, location or text range, question, and review state together.
- Separate explicit requests, factual corrections, one-off layout requests, recurring preferences and review outcomes.
- A frequent topic does not establish a preferred direction. Approval of a draft does not prove approval of every design choice.
- Scope candidates first to the same artifact/project; widen them only when comparable evidence supports it. Keep apparently conflicting requests with their dates and contexts.
- Use the next review to test whether an applied preference reduced repeated corrections. Keep rejected hypotheses and exceptions visible.
- Distinguish platform identities, guest names, and unrecorded actors. Do not merge people on name alone.

## Coverage

`ReviewFeedbackMemory` is independent of operational review rows and survives their deletion. Storage triggers preserve evidence atomically for these content-review sources:

| Source | Evidence |
|---|---|
| PageComment | Report, website, shared newsletter and social comment threads |
| PageReview | Round/status transitions |
| NewsletterComment | Native newsletter notes, corrections, resolution |
| CodeReviewNote | Pasted-content notes and resolution |
| DesignPin | Artwork comments/replies, page and coordinates |
| DesignAnswer | Design question, choice and written response |
| DesignQuestion | Review questions/options, retained as review actions |
| DesignArtwork | Approval notes and decisions |
| DesignReview | First viewing, OK, withdrawal and requests; repeated viewing is deduplicated |
| SocialPost | Human approval/withdrawal context; automated publishing does not imply a preference |
| NewsletterCycle | Sign-off notes and decisions |
| ScriptComment | Video/script notes, section, text range and quoted wording |

Approvals, views, resolution and other state changes have `signal: activity`. They stay in the history and are excluded from preference-topic counts. If a workflow has no recorded round number, the UI labels the record as version context.

Newsletter drafts stay `pending` until an editor explicitly opens team review. Newsletter and Social use a separate team-round counter; saving only advances the stored version (the historical `round` key), and neither versions nor comments are renumbered. An explicit opening advances the team round without modifying the saved version or comment history. The helper captures an attributed activity in the existing PageReview feedback journal in the same transaction. Recover historic newsletter openings only from an initial recorded open state and explicit pending-to-open transitions at the same version. Where older evidence is missing, show the first tracked team round. No invitations are sent by opening a round.

Existing shared comment IDs remain compatible with application-level capture and are not overwritten. Direct SQL body changes and reversions receive distinct records when version metadata was not incremented. URL credentials/query/fragments and raw document/image bytes are not copied into the ledger; document revisions are hashed.

Source comments available at activation form a baseline. Wording already overwritten or deleted before activation may not be recoverable. New workflows must register an adapter and a trigger plus a regression covering before/after, deletion, rollback and identity attribution. Exclude unrelated applicant, personnel and trainee-assessment data from content-style learning.

## Verification

Generate a local schema with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`. Run the integration script against an isolated local PostgreSQL socket:

```
python3 tests/integration/review-feedback-storage.py --socket /path/to/private/socket --port 55439 --schema /path/to/generated-schema.sql
```

The script creates/removes only its own temporary database. Unrelated vector columns are substituted in the test schema when pgvector is unavailable; review-source column definitions stay unchanged.

The workflow is inspired by evaluation-and-refinement patterns described in [Anthropic’s Building effective agents](https://www.anthropic.com/research/building-effective-agents).

## Mandatory integration for future features

`config/review-feedback-sources.json` is the source/workflow registry. `npm run check:review-feedback` runs before production builds and in the blocking Review feedback integration CI job.

- New review/comment/feedback/note/approval pages and API routes must declare their workflow in the registry. A feature reusing registered storage inherits automatic capture.
- Every new Prisma model must be classified. New content-review storage needs a source entry with an evidence type; other models need a specific `excludedModels` reason. The current non-content baseline is frozen and checksum-protected.
- Put new capture DDL in a dedicated migration and add it to `captureMigrations`. Add its adapter and trigger without modifying already-applied migrations. CI compares the registry and capture migrations with the pre-push or PR base commit and rejects rewriting/removing previously registered capture migrations.
- Add a source fixture and evidence assertion to the shared PostgreSQL regression. CI compares the installed trigger set with the registry and requires a real history record for every registered source. The registry drives the test source count; a source cannot be added without extending coverage.
- Preserve context/identity, prior versions, deletion and rollback behavior. Keep review activities separate from inferred style preferences, and expose each project's history through the shared history viewer.
- The guard classifies detected review surfaces and all schema models. Semantic classification remains a development responsibility; new review storage must be registered even if its model or route name does not include “review”.

Completion checks: `npm run check:review-feedback`, `npm run test:review-feedback`, and the real PostgreSQL integration job. These are development/build requirements; no new reviewer-facing controls are introduced.
