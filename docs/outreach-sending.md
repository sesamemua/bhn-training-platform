# Outreach — sending email as info@biohubnet.ca

Workspace → Outreach can send its campaign emails itself instead of only
handing you a `mailto:` link. The DNS below was the blocker; **as of
2026-08-16 the authentication records are published** — see the current
state table.

---

## Before the first real send

Re-verified live on 2026-08-16 (was all-blocking on 2026-08-13):

| Record | State | Consequence |
|---|---|---|
| `MX biohubnet.ca` | `1 smtp.google.com` | The mailbox is Google Workspace |
| `TXT biohubnet.ca` | ✅ `v=spf1 include:_spf.google.com ~all` | Google's servers are authorised to send as the domain |
| `google._domainkey.biohubnet.ca` | ✅ `v=DKIM1; k=rsa; p=…` (2048-bit) | Workspace DKIM key is published |
| `TXT _dmarc.biohubnet.ca` | ✅ `v=DMARC1; p=none; rua=mailto:info@biohubnet.ca` | Monitoring with a reporting address |

Re-check any time with:

```
dig +short TXT biohubnet.ca
dig +short TXT google._domainkey.biohubnet.ca
dig +short TXT _dmarc.biohubnet.ca
```

### ✅ Fully authenticated — verified end to end 2026-08-17

`Start authentication` was pressed in Workspace Admin → Apps → Google
Workspace → Gmail → Authenticate email (the console had read
*"Status: Not authenticating email"* — the record was published but
dormant). Console now reads **"Authenticating email with DKIM."**

Before and after, from real test messages sent via Admin → System status
to an external Outlook mailbox:

| | Before (10:41) | After (10:56) |
|---|---|---|
| `spf` | pass | pass |
| `dkim` | pass, but `header.d=biohubnet-ca.20251104.gappssmtp.com` (Google's shared key) | pass, **`header.d=biohubnet.ca`** |
| `dmarc` | pass — on SPF alignment alone | pass — SPF **and** DKIM aligned |
| `compauth` | pass reason=100 | pass reason=100 |
| Delivery | Inbox | Inbox |
| From | `BHN Training <info@biohubnet.ca>`, not rewritten | same |

Both alignment paths now hold, so DMARC survives forwarding — which
matters because much of the seeded directory is `@utoronto.ca` /
`@uhn.ca`, where auto-forwarding to a personal address is common and
breaks SPF.

**Before pressing the button, always diff the console's `p=` value
against the live DNS record.** They matched byte-for-byte here (392
chars). If they ever differ, fix DNS first — and never click
`GENERATE NEW RECORD` on a working setup, since that rotates the key and
instantly invalidates what is published.

Re-check any time:

```
dig +short TXT biohubnet.ca
dig +short TXT google._domainkey.biohubnet.ca
dig +short TXT _dmarc.biohubnet.ca
```

Next hardening step, once a few weeks of clean `rua` reports are in:
move DMARC from `p=none` to `p=quarantine`.

### 1. Publish SPF — blocking · ✅ DONE 2026-08-16

Add **one** TXT record at the apex (`biohubnet.ca`):

```
v=spf1 include:_spf.google.com ~all
```

Two separate SPF records is a permanent fail — if one already exists, merge the
`include:` into it rather than adding a second.

### 2. Turn on Workspace DKIM — ✅ DONE 2026-08-17 (Start authentication pressed)

Google Workspace Admin → **Apps → Google Workspace → Gmail → Authenticate
email**. Generate a 2048-bit key, publish the TXT record it gives you at
`google._domainkey`, then press **Start authentication**.

Without this, outbound mail is signed with Google's `*.gappssmtp.com` key, which
does not align with `biohubnet.ca`.

### 3. Add a DMARC reporting address — ✅ DONE (rua=info@biohubnet.ca)

```
v=DMARC1; p=none; rua=mailto:dmarc@biohubnet.ca
```

Leave the policy at `p=none` until SPF and DKIM have been passing for a few
weeks, then consider `p=quarantine`.

### 4. Set the sending credentials on Vercel

The From line is **not** set in code — it comes from `SMTP_FROM`:

```
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = info@biohubnet.ca
SMTP_PASS = <a Google App Password, not the account password>
SMTP_FROM = BioHubNet <info@biohubnet.ca>
```

Gmail rewrites an unverified From, so `SMTP_USER` and the address inside
`SMTP_FROM` must match. An App Password requires 2-Step Verification on that
account.

### 5. Know the ceiling

Google Workspace allows roughly **2,000 recipients per day** per mailbox and
dislikes bursts. The sender throttles to one message every 400ms and caps a
request at 40 recipients; a large list is sent in chunks, not one blast.

---

## How sending behaves

**Nothing sends without an explicit confirmation.** Selecting recipients runs a
dry run first — every check runs and every message renders, but nothing leaves.
The confirmation names the number of recipients, the number being skipped and
why, and the subject line of the first message. The message you approve is the
message that goes, because preview and send call the same renderer.

**A contact cannot be emailed twice by the same campaign.** `OutreachSend` has a
unique `(campaignId, personId)`, and the row is written *before* the message
goes out. A double-click, a retry, or a refreshed page loses that race and skips.

**Failures are recorded as failures.** The old `sentPersonIds` array could only
say "reached"; a bounce had nowhere to live, and marking someone reached also
stamps `introSentAt`, which would have silently demoted them to the
returning-contact template forever. Every attempt now records status, the
address used, the rendered body, and the error if there was one.

**Unaddressable rows are skipped, not fatal.** Placeholder entries with no
address ("find the comms person at CDL") are normal; they're recorded as skipped
and stepped over.

**Replies go to the sender.** From stays `info@biohubnet.ca`, but `Reply-To` is
set to the signed-in staff member who pressed send, so an answer reaches a
person rather than the shared inbox.

## CASL

These are commercial electronic messages to Canadian organisations, so every
sent email carries:

- **Who we are** — BioHubNet, with a mailing address and contact email
- **A working unsubscribe** — a signed per-person link, valid indefinitely

Unsubscribing is recorded on the **person**, so it holds across every list and
every future campaign, and the send path checks it on every message. The
unsubscribe page is public and unauthenticated by necessity: a partner has no
platform account.

The signature is derived from `NEXTAUTH_SECRET`. Rotating that secret
invalidates every unsubscribe link already sent, which would breach the
60-day requirement — don't rotate it without re-issuing.

## Who can send

**Admins only.** A wider gate would let anyone instructor+ email every partner
in the directory. Note that the public share-link routes let a collaborator with
an edit link change a contact's email address — the send path validates the
address server-side, but the roster itself is only as trustworthy as who holds
those links.
