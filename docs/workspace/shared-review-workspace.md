# Shared review workspace: newsletter pilot

Implemented as an extension of Page Review, not a separate reviewer. This release enables shared contextual commenting for newsletter HTML and keeps the report's direct editing and specialist tools intact. The remaining Social/Email/Website/Design adapter rollout is a later milestone, not included here.

Follow-up correction: Copy/export controls now live in the lower-left action dock, not the comment panel. Newsletter wording can be edited directly on the page and saved with **Save revision**. A batch save archives the previous round and updates the saved newsletter/export; staff identity and the edits are audited. Stale, sent and locked content cannot be overwritten. The raw contributed copy remains unchanged. See [tool contracts](review-tool-contracts.md) for the separation between tool purpose, common UI and media-specific implementation.

November 26 interaction correction: a paragraph or list item is one review/edit target, including its inline links and emphasis. Clicking a newsletter element opens an action menu instead of navigating or exposing separate text-node fields. Text edits use one whole-block field; image targets offer comments, replacement and supported crop/rotate/flip/alt/size/alignment/removal operations. Text and image changes remain staged until **Save revision**, and **Discard edits** restores the original markup. Crop/rotation are baked into new public image assets for email compatibility. The older text-node patch contract remains an internal persistence detail, not a visible editor boundary.

Unified-experience requirement: the concept layer defines the same action meanings; the shared workspace owns the look and feel, toolbar, panels, menus, dialogs, keyboard behavior, revision comparison and save/conflict presentation. Media adapters change content targeting/rendering and operations, not the overall interface. Existing report and social branches retain their functioning editors during incremental alignment; this pilot is not a claim that every format has already reached full UI parity.

## Boundaries

- `overlay-source.ts` owns the panel, threads, identity, history, comparison, and write destinations.
- `contextual-source.ts` owns the same nearby Comment action for report and newsletter. It delegates target capture and uses the existing composer. Report menus and editing remain in the report source modules.
- `html-targets.ts` captures newsletter article/part/image identifiers when available. Legacy HTML uses a unique verified text/context match; repeated or missing targets do not fall back to a different button. New anchors use existing PageComment fields with a `bhn-html:` discriminator.
- `comment-copy-source.ts` is a read-only export of current/all-round threads and replies. Clipboard denial leaves selectable text. The report's explicit copy-and-lock command remains independent.
- Existing saved snapshots, compare selection (2-4 rounds), diff generation and one shared vertical scrollbar are reused. Newsletter comparison now opens explicitly, like report comparison.

## Data and compatibility

The renderer binds its saved round to the overlay script. Public newsletter mutations and staff newsletter comment commands require that displayed round; historical newsletter comments are read-only. Serializable transactions already used by the handlers protect the check and write together and retry conflicts. A stale open tab receives a reload-required error, keeps its unsaved feedback, and cannot silently file it under the new round. No new autosave or database migration.

Existing links, identities and review IDs remain unchanged. Legacy newsletter and pasted notes remain in their original views and stores. Existing permissions are not broadened. The registered PageReview/PageComment history capture remains authoritative.

Set `NEWSLETTER_CONTEXTUAL_REVIEW=off` server-side to use the previous newsletter interaction UI. Keep the round checks enabled. New pilot comments remain readable after rollback; do not restore an old database or overwrite saved HTML. A browser tab opened before deployment may need to reload to obtain the round-bound client.

## Verification

- Focused unit suites: `node --import tsx --test tests/unit/page-review*.test.ts tests/unit/newsletter-review*.test.ts* tests/unit/workflow-review*.test.ts`.
- Existing report unified-review and newsletter round/comparison browser regressions.
- `tests/browser/newsletter-contextual-review.ts`: isolated HTML fixture with two reviewers, repeated CTAs, replies, status controls, explicit comparison, read-only clipboard fallback, touch/keyboard/mobile selection, stale-draft retention and UI rollback.
- `tests/browser/newsletter-review-live.ts`: opt-in actual Next.js server on localhost:3207 using only a disposable database named `bhn_shared_review_pilot`. Seeds and removes its own synthetic review. Uses a fixture-only signing key shared with the local server and blocks external browser traffic. Verifies rendered round, saved anchors/author, evidence, resolution, and stale mutation rejection.
- `npm run check:review-feedback`, `npm run test:review-feedback` and `tests/integration/review-feedback-storage.py` on disposable PostgreSQL.

Never run the local fixture against production credentials. The normal build invokes `prisma migrate deploy`; no local production build is necessary for these checks.
