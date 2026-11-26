# Review tools and media adapters

## Separation

1. **Tool meaning:** An edit changes content; a comment records feedback; Locate finds a comment's target; Compare compares saved versions; Copy produces a read-only handoff. None of these meanings depends on HTML, report JSON, an image or a video.
2. **Shared presentation:** Placement, buttons, accessibility, scope controls, loading/conflict states and clipboard fallbacks belong to the shared workspace. Copy/export actions live outside the thread panel in the lower-left action dock.
3. **Media implementation:** An adapter decides which tools it supports, what its target is, how to render changes and where to save. Authorization, current-version checks, evidence and side effects remain server responsibilities, not client capability flags.

## Implemented boundary

`media-tools.ts` defines the format-independent text-edit contract: state, save and discard. The dock calls this contract and does not know the media's DOM, JSON, endpoint or versioning logic. `inline-text-source.ts` supplies the newsletter HTML implementation. The UI edits whole semantic paragraphs/list items, then safely maps the changes to original text-node patches, preserving links and emphasis. Ambiguous edits spanning inline-format boundaries keep the draft and explain the conflict rather than flattening markup. The scoped staff endpoint archives one prior round and updates the saved HTML/export atomically. AuditLog records the staff editor; PageReviewVersion and existing feedback-history capture retain version context. Original contributions remain untouched.

Report editing stays in its existing report editor, including its own autosave and photo handling. It does not get an HTML editor or the newsletter endpoint. The existing report contextual-comment action remains shared. This increment does not claim every older format branch has been removed.

The newsletter image adapter supports commenting on a selected image, replacement uploads, alt text, width, alignment, removal, and baked crop/flip/quarter-turn adjustments. Its scoped document endpoint accepts only active staff review credentials and checks the open, unsent issue's round, HTML hash and issue revision. Uploading creates a public library asset but does not change the document; Save atomically archives the previous round, updates reviewed HTML/export and recognized Compose image references, and records the editor. Original contributions remain untouched. Earlier rounds retain asset usages. Width/alignment are saved-review layout edits, not additions to the AI-owned layout model; a later structured re-layout is not a promise to preserve every manual styling adjustment.

The newsletter, report, social-copy and live website reviews share an element action menu, click-to-edit paragraphs, adjacent Comment on element and More text tools, a text dialog, review control row, thread panel and copy dock. Explicit link clicks keep their existing menu. Direct edits finish when leaving the paragraph, pressing Enter, or closing More text tools; cancel/discard leaves the text unchanged. The dialog only exposes formatting supported by the adapter. Newsletter supports selected bold and italic or a house-styled list for a plain paragraph, with a preview; no font, size, arbitrary HTML or per-block style controls.

All adapters use the same editor shell, with real differences made explicit. Newsletter and social automatically save finished direct text edits through their existing versioned routes and archive the prior version. Newsletter never silently commits pending photo changes; text stages with those edits for explicit Save revision. Conflicts retain the draft. Social uses existing draft-edit rules (including invalidating approval on text changes), never publishes, and saves the draft and review snapshot atomically. Report commits through its existing autosave, without starting a new round. Website prepares an anchored, unposted comment draft; Add comment remains explicit and never edits the site. Staff can resolve current website threads; guests cannot. Comparison appears only when there are saved versions, not on unsnapshotted live URLs.

Newsletter Review defaults to the most recently updated open, saved, unsent review. An explicit issue selection still wins, and Compose retains its calendar-based default.

## Rules for further extraction

| Tool | Common promise | Adapter supplies |
| --- | --- | --- |
| Comment | Thread, reply, identity and lifecycle | A paragraph/section target, normalized image pin, live element or timecode |
| Edit text | Editable wording, save/discard state, clear conflict result | HTML text patch, report-field edit, social copy edit, or unsupported |
| Locate | Scroll/focus the correct target, or report missing/ambiguous | Target lookup and coordinate transformation |
| Compare | Explicit selection of saved versions; never create a version on read | Text diff, visual side-by-side, or unsupported |
| Copy comments | Chosen scope, context, author and replies; no state mutation | Authorized thread data and target label, not a duplicated copy button |

Register a capability only when it has a genuine implementation and permission checks. Do not make image editing mean contenteditable HTML, force report saves through newsletter storage, or give a video a text diff. Migrate older comment/navigation/comparison branches incrementally with the same contract tests; do not introduce a second review database or duplicate toolbar per medium.
