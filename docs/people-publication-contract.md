# Approved symposium people feed v1

Implementation route: GET /api/public/events/2026-annual-symposium/people
Production URL (available only after the platform deployment):
https://bhn-training-platform.vercel.app/api/public/events/2026-annual-symposium/people

The roster admin endpoint is private and is NOT this feed.

## Response

```json
{
  "schemaVersion": 1,
  "eventId": "2026-annual-symposium",
  "initialized": true,
  "complete": true,
  "revision": 3,
  "updatedAt": "2026-10-07T20:00:00.000Z",
  "people": [{
    "id": "stable-roster-person-id",
    "approvedRevision": 2,
    "fullName": "Example Person",
    "title": "Research Director",
    "organization": "Example Organization",
    "bio": "Plain text only.",
    "photoUrl": null,
    "linkedinUrl": null,
    "links": [{"label": "Example Organization", "url": "https://example.org/"}],
    "placements": [{"id": "stable-roster-person-id:panel-1", "sessionId": "panel-1", "order": 0}]
  }]
}
```

- Allowed session IDs: keynote, panel-1, panel-2, panel-3, networking, discussion.
- Multiple placements per person are permitted, but not duplicate session IDs.
- Placement IDs are `personId:sessionId`; order is a nonnegative integer.
- Titles/times/anchors/styles remain website-owned. Unknown session IDs must not be silently substituted.
- All profile text is plain text. Render with textContent, never innerHTML. Structured links are separately approved HTTPS links; do not infer links inside bios.
- photoUrl and linkedinUrl are nullable. Images are copied to content-addressed publication assets before approval, outside mutable speaker-upload paths.
- approvedRevision is the global publication revision when that person's snapshot was last approved.
- revision is a monotonically increasing global safe integer, advancing on approval, unpublish and initial activation. Draft saves do not change it.
- updatedAt is null before any publication operation, otherwise an ISO timestamp. It does not change for draft-only saves.
- Before explicit human activation, initialized=false, complete=false, people=[] (even when profiles have been individually approved). Preserve the site's current cards.
- Activation is a separate human action after the full initial list has been reviewed. No automatic activation on first approval.
- Once initialized, initialized and complete stay true. A complete empty people list is authoritative and removes all feed-owned people.
- Unpublish removes a person from the next full snapshot and advances revision. No tombstones are required.
- GET always returns 200 for a valid snapshot, including not-initialized. Database/corrupt-state errors return 503 with no-store, never an empty successful list.
- Public Cache-Control: public, max-age=30, s-maxage=30, must-revalidate. No stale-while-revalidate.
- ETag supports If-None-Match/304. CORS allows read-only GET/OPTIONS from any origin with no credentials, and exposes ETag.
- Ignore regressive revisions. Reject partial/invalid snapshots atomically. Keep last-known-good approved data during errors; distinguish errors from authoritative empty/unpublish.
- No private emails, source IDs, matching candidates, planning notes, draft values or reviewer identities appear in this feed.

Synthetic examples are in tests/fixtures/people-publication-feed.json. They are test data only, never production defaults.
