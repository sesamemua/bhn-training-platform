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

### ⚠️ DKIM is published but NOT switched on — verified 2026-08-17

A test message sent through the platform (Admin → System status) to an
external Outlook mailbox came back with:

```
Authentication-Results: spf=pass (sender IP is 209.85.160.173)
 smtp.mailfrom=biohubnet.ca; dkim=pass (signature was verified)
 header.d=biohubnet-ca.20251104.gappssmtp.com; dmarc=pass action=none
 header.from=biohubnet.ca; compauth=pass reason=100

DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
 d=biohubnet-ca.20251104.gappssmtp.com; s=20251104;
```

Read that carefully — `dkim=pass` is **not** the win it looks like. The
signing domain is Google's shared default key
(`…gappssmtp.com`), not the `google` selector published at
`google._domainkey.biohubnet.ca`. The record is in DNS but dormant:
nobody pressed **Start authentication** in the admin console, so the
domain's own key has never signed a message.

Consequence: DKIM does **not** align with `biohubnet.ca`, so DMARC is
currently passing on the strength of SPF alone. That works for direct
delivery, but SPF breaks on any forwarding (mailing lists, `@utoronto.ca`
auto-forwards to a personal address — common in exactly this audience),
and with no aligned DKIM to fall back on, those forwarded copies fail
DMARC.

**The fix is one click**, since the DNS is already correct: Workspace
Admin → Apps → Google Workspace → Gmail → Authenticate email → select
`biohubnet.ca` → **Start authentication**. Re-send the test afterwards
and expect `header.d=biohubnet.ca`.

What already works, same test:

| Check | Result |
|---|---|
| Delivery | Inbox, not Junk (`compauth=pass reason=100`) |
| SPF | `spf=pass`, aligned (`smtp.mailfrom=biohubnet.ca`) |
| DMARC | `dmarc=pass` — via SPF alignment only |
| From line | `BHN Training <info@biohubnet.ca>` — Gmail did **not** rewrite it, so `SMTP_FROM`/`SMTP_USER` are set correctly |

DNS is on Cloudflare (`davina`/`jaime.ns.cloudflare.com`), so all of this is
editable by whoever holds that account.

Most of the seeded directory is `@utoronto.ca`, `@uhn.ca`, `@torontomu.ca` —
university and hospital filters are exactly the ones that score unauthenticated
bulk mail harshly. Sending before this is done risks the domain's reputation,
which is slow and painful to repair.

### 1. Publish SPF — blocking · ✅ DONE 2026-08-16

Add **one** TXT record at the apex (`biohubnet.ca`):

```
v=spf1 include:_spf.google.com ~all
```

Two separate SPF records is a permanent fail — if one already exists, merge the
`include:` into it rather than adding a second.

### 2. Turn on Workspace DKIM — ⚠️ RECORD PUBLISHED, SIGNING STILL OFF (see above)

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
