# Social post images — the contract

The platform drafts the **words** for routine social posts and writes an
`assetSpec` describing the **image** it needs. A separate agent builds the
renderer. This file is the whole interface between the two; you should be
able to build against it without reading the rest of the codebase.

## Where the spec lives

`SocialPost.assetSpec` — a JSONB column. One row per post.
Read the rows you want, render, then write the URL back:

```
POST /api/admin/social/posts
{ "action": "setAsset", "id": "<post id>", "assetUrl": "https://…" }
```

That endpoint is admin-authenticated and is the **only** field the
renderer writes. Nothing else in the row is yours.

## The shape

```ts
interface AssetSpec {
  version: 1;
  template: "vc-launch" | "vc-reminder" | "vc-recipients";
  headline: string;          // the one line, set large. ≤ 60 chars.
  subhead: string;           // supporting line. May be "".
  footnote: string;          // corner detail — a date or a count.
  names: { name: string; detail: string }[];  // empty except for recipients
  sizes: ("square" | "portrait" | "landscape")[];
}
```

`version` exists so you can **refuse** a spec you do not understand rather
than drawing something wrong. It will be bumped if a template's required
fields change; fields are never repurposed.

## What it deliberately does not contain

No database ids, no email addresses, no applicant who has not consented to
be named, and no text that is not also in the post body. An image is
harder to retract than a sentence, so the spec carries only what the
words already say.

## Rendering notes

- **Sizes**: `square` 1080×1080, `portrait` 1080×1350, `landscape` 1200×627.
- **Brand**: BioHubNet's colour tokens are in `src/app/globals.css`
  (`--brand-*`). The logo must be used as the official full lockup and
  never re-typed or cropped; the colour PNG is in `public/`, and there is
  a white/reversed version for dark grounds.
- **Names lists** can be 1–10 long. `detail` is a venture, sometimes with
  an amount. Set it smaller than `name`.
- A post is publishable **without** an image — `assetUrl` staying null is
  a normal state, not a failure.

## What the platform will not do

It will not publish anything. There is no LinkedIn app, no OAuth token
store and no third-party posting integration in this codebase. A
coordinator approves a post, copies the words, takes the image and posts
it themselves.
