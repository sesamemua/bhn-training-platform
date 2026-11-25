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

Existing shared comment IDs remain compatible with application-level capture and are not overwritten. Direct SQL body changes and reversions receive distinct records when version metadata was not incremented. URL credentials/query/fragments and raw document/image bytes are not copied into the ledger; document revisions are hashed.

Source comments available at activation form a baseline. Wording already overwritten or deleted before activation may not be recoverable. New workflows must register an adapter and a trigger plus a regression covering before/after, deletion, rollback and identity attribution. Exclude unrelated applicant, personnel and trainee-assessment data from content-style learning.

## Verification

Generate a local schema with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`. Run the integration script against an isolated local PostgreSQL socket:

```
python3 tests/integration/review-feedback-storage.py --socket /path/to/private/socket --port 55439 --schema /path/to/generated-schema.sql
```

The script creates/removes only its own temporary database. Unrelated vector columns are substituted in the test schema when pgvector is unavailable; review-source column definitions stay unchanged.

The workflow is inspired by evaluation-and-refinement patterns described in [Anthropic’s Building effective agents](https://www.anthropic.com/research/building-effective-agents).
