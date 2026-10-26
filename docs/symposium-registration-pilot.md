# Native symposium registration pilot

User clarified on October 26, 2026: **do not use Luma for registration or checkout; reuse only its underlying payment provider/account.** The earlier Luma embed has been removed.

- Admin route: `/admin/workspace/symposium-2026/registration-pilot`.
- Luma uses Stripe. Direct access to that existing merchant account must be established separately; a Luma event-host session is not a Stripe API credential.
- The production Vercel environment currently has neither `STRIPE_SECRET_KEY` nor `STRIPE_WEBHOOK_SECRET`. The admin page reports presence only, never claims a verified connection or enables checkout merely because a key exists.
- The current Luma login manages the symposium, but its calendar is owned by the event creator. Only the current login's separate Personal calendar appeared under My Calendars. The existing Stripe account owner needs to sign in or provide properly scoped access. Do not create a duplicate account, change payouts, unlink Luma or disturb past paid registrations.
- Pilot is inactive; no registration form, Luma iframe, payment button, charge or guest-list sync runs from it. Existing historical Luma badge/guest functionality is unchanged.

## Required before implementation and activation

1. Sign into the Stripe account already used for symposium payments and verify the merchant identity/account ID. If Luma-created account restrictions prevent independent API access, resolve with Stripe support; do not assume the account is portable.
2. Connect that account directly and securely configure test-mode credentials and a signed webhook endpoint. Never paste keys into chat or send them to the client.
3. Reuse and audit existing native registration, ticketing, Stripe helper and webhook code before enabling the pilot. The current paid checkout code is not launch approval: registration-window enforcement, payment/free-registration bypasses, capacity races, replay/idempotency, required answers, approval/capture behavior and payment verification need focused checks.
4. Test a separate pilot event in Stripe test mode, including failure/cancellation/retry, signed webhook confirmation and attendee records. No public launch or real charge without approval.

Official provider reference: https://help.luma.com/p/how-to-set-up-your-stripe-account
