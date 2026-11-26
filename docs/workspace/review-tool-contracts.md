# Review tools and media adapters

## Separation

1. **Tool meaning:** An edit changes content; a comment records feedback; Locate finds a comment's target; Compare compares saved versions; Copy produces a read-only handoff. None of these meanings depends on HTML, report JSON, an image or a video.
2. **Shared presentation:** Placement, buttons, accessibility, scope controls, loading/conflict states and clipboard fallbacks belong to the shared workspace. Copy/export actions live outside the thread panel in the lower-left action dock.
3. **Media implementation:** An adapter decides which tools it supports, what its target is, how to render changes and where to save. Authorization, current-version checks, evidence and side effects remain server responsibilities, not client capability flags.

## Implemented boundary

`media-tools.ts` defines the format-independent text-edit contract: state, save and discard. The dock calls this contract and does not know the media's DOM, JSON, endpoint or versioning logic. `inline-text-source.ts` supplies the newsletter HTML implementation. It edits meaningful original text nodes, preserves links/markup, and sends plain-text patches through a scoped staff endpoint. Save archives one prior round and updates the saved HTML/export atomically. AuditLog records the staff editor; PageReviewVersion and existing feedback-history capture retain version context. Original contributions remain untouched.

Report editing stays in its existing report editor, including its own autosave and photo handling. It does not get an HTML editor or the newsletter endpoint. The existing report contextual-comment action remains shared. This increment does not claim every older format branch has been removed.

## Rules for further extraction

| Tool | Common promise | Adapter supplies |
| --- | --- | --- |
| Comment | Thread, reply, identity and lifecycle | A paragraph/section target, normalized image pin, live element or timecode |
| Edit text | Editable wording, save/discard state, clear conflict result | HTML text patch, report-field edit, social copy edit, or unsupported |
| Locate | Scroll/focus the correct target, or report missing/ambiguous | Target lookup and coordinate transformation |
| Compare | Explicit selection of saved versions; never create a version on read | Text diff, visual side-by-side, or unsupported |
| Copy comments | Chosen scope, context, author and replies; no state mutation | Authorized thread data and target label, not a duplicated copy button |

Register a capability only when it has a genuine implementation and permission checks. Do not make image editing mean contenteditable HTML, force report saves through newsletter storage, or give a video a text diff. Migrate older comment/navigation/comparison branches incrementally with the same contract tests; do not introduce a second review database or duplicate toolbar per medium.
