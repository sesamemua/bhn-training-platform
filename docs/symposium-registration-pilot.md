# Symposium registration pilot

- Admin preview: `/admin/workspace/symposium-2026/registration-pilot`, under **2026 Symposium**.
- Uses the real official inline Luma registration embed, not sample data or a payment sandbox.
- Existing event: `evt-az4yQOZR33DBiid` / `https://luma.com/wh30nh1n`.
- Verified the embed URL and `allow="fullscreen; payment"` on the event's **More > Embed Event Page** screen on October 26, 2026. The host screen showed registration closed; nothing was reopened.
- All attendee form fields and payment entry are inside Luma's embed on the platform. There is no second local form, Registration row or charge. Luma controls prices, coupons, approval, receipts, capacity and registration windows.
- Uses the existing campaign sanitizer to forward allowlisted attribution in the iframe URL, with `training-platform-pilot` as the default source. Never forwards arbitrary query parameters, email addresses, tokens or coupon/unlock codes.
- No page view, redirect or browser message is recorded as a completed registration/payment. Luma is the authoritative record. Existing platform Luma guest/badge sync is unchanged; the existing host session can expire and needs renewing when reported by Print Jobs.
- No new provider installation, billing account, secret, migration or public registration link. Existing Stripe helpers are deliberately not used: a Luma-connected payment account is not assumed to be a platform-owned Stripe integration.

## Before public launch

Explicit approval is required to replace public registration links or reopen registration. Decide whether this pilot targets the current symposium or a separate future/test event. A live end-to-end payment, approval and receipt test has not been performed against the closed event. Do not create a real charge merely to test this preview.

The embedded form belongs to Luma; it cannot be restyled or given custom platform validation. Apple Pay requires hosted Luma checkout rather than an embed. If a fully platform-owned form/payment flow is required, that is a separate merchant/API integration, not an assumed reuse of Luma's credentials. Do not build payment calls against the host-session/private API.

Official reference: https://help.luma.com/p/embed-luma-on-your-website
