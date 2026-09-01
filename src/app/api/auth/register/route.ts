import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { trackServer } from "@/lib/analytics";
import { verifyTurnstile, clientIpFromHeaders, TURNSTILE_ENABLED } from "@/lib/security/captcha";
import { issueAndSendEmailVerification } from "@/lib/security/email-verify";
import { checkPassword } from "@/lib/security/password-policy";
import { subscribeMember, mailchimpEnabled } from "@/lib/mailchimp/client";
import { findInstitution } from "@/lib/equip/institutions";
import { sanitizeCampaignAttribution } from "@/lib/campaign/attribution";

/**
 * Newsletter intent at signup. Tri-state:
 *   "subscribe" — opt in (user actively chose; form default is "no")
 *   "no"        — not interested (default in the form per CASL: consent
 *                  must be a clear affirmative action, not pre-checked)
 *   "already"   — user is already on the BioHubNet list (don't double-add)
 *
 * When the value is "subscribe" the register API pushes the user to
 * Mailchimp with status="pending", which triggers Mailchimp's DOI
 * confirmation email — only the link click flips them to "subscribed".
 * That click is the CASL-grade audit trail.
 */
type NewsletterStatus = "subscribe" | "no" | "already";

function normaliseNewsletter(input: unknown): NewsletterStatus {
  if (input === "subscribe" || input === "no" || input === "already") return input;
  // Back-compat: older clients still post a boolean.
  if (input === true)  return "subscribe";
  if (input === false) return "no";
  return "no";
}

const SUPPORTED_LOCALES = ["en", "es", "fr", "zh", "hi", "ko", "pa", "ar"];

const VALID_JOB_TITLES = [
  "Master's student",
  "PhD candidate",
  "Postdoctoral Fellow",
  "Research Associate",
  "Lab Technician",
  "Industry Professional",
  "Other",
] as const;

export async function POST(req: NextRequest) {
  const {
    name,
    email,
    password,
    newsletter,
    jobTitle,
    locale,
    institution,
    institutionOther,
    turnstileToken,
    campaignAttribution,
  } = await req.json();
  const attribution = sanitizeCampaignAttribution(campaignAttribution);

  // ── Validation ──────────────────────────────────────────────────
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
    return NextResponse.json({ error: "Name is required (2–80 characters)." }, { status: 400 });
  }
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }
  if (typeof password !== "string") {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }
  const policy = checkPassword({ password, email: cleanEmail, name: cleanName });
  if (!policy.ok) {
    return NextResponse.json({ error: policy.reason }, { status: 400 });
  }

  // Turnstile (CAPTCHA) verification — gated by env. The helper
  // returns ok:true when the secret isn't configured, so this is a
  // no-op in preview / local until ops sets TURNSTILE_SECRET_KEY.
  if (TURNSTILE_ENABLED) {
    const ip = clientIpFromHeaders(req.headers);
    const turn = await verifyTurnstile(turnstileToken, ip);
    if (!turn.ok) {
      return NextResponse.json(
        { error: "Bot check failed. Please try again." },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);
  const userCount = await prisma.user.count();

  const newsletterStatus = normaliseNewsletter(newsletter);
  const subscribed = newsletterStatus === "subscribe";

  // Optional fields with sane fallbacks
  const cleanLocale = typeof locale === "string" && SUPPORTED_LOCALES.includes(locale)
    ? locale
    : "en";
  const cleanJobTitle = typeof jobTitle === "string"
    && (VALID_JOB_TITLES as readonly string[]).includes(jobTitle)
    ? jobTitle
    : null;

  // Institution capture at registration. Two paths:
  //   • The caller posts a known BHN-partner slug (one of the
  //     41 from lib/equip/institutions.ts) — we resolve to the
  //     official full name and store as User.organization.
  //   • The caller picks "Other" and posts `institutionOther`
  //     as free text — we store that verbatim.
  // Either way we save into the existing User.organization
  // column so every form on the platform that pre-fills from
  // user.organization (Equip applications, talent profile, HR
  // posting fillers) Just Works.
  let cleanOrganization: string | null = null;
  if (typeof institution === "string" && institution.trim()) {
    if (institution === "other" && typeof institutionOther === "string" && institutionOther.trim()) {
      cleanOrganization = institutionOther.trim().slice(0, 200);
    } else {
      const known = findInstitution(institution);
      if (known) cleanOrganization = known.name;
    }
  }

  const user = await prisma.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      password: hashed,
      role: userCount === 0 ? "superadmin" : "trainee",
      newsletterSubscribed: subscribed,
      newsletterSubscribedAt: subscribed ? new Date() : null,
      newsletterStatus,
      locale: cleanLocale,
      jobTitle: cleanJobTitle,
      organization: cleanOrganization,
    },
  });

  // Mailchimp push — only when the user actively opted in. We always
  // request status="pending" (double-opt-in), so the legal audit
  // trail comes from the user clicking the Mailchimp confirmation
  // email, NOT from the signup form tick alone. Best-effort: if
  // Mailchimp is down or unconfigured we store mailchimpStatus="error"
  // so an admin can retry later, but account creation still succeeds.
  let mailchimpFinalStatus: string | null = null;
  let mailchimpMemberId: string | null = null;
  if (subscribed && mailchimpEnabled()) {
    const ip = clientIpFromHeaders(req.headers);
    const firstName = cleanName.split(/\s+/)[0] ?? null;
    const lastName = cleanName.split(/\s+/).slice(1).join(" ") || null;
    const mcResult = await subscribeMember({
      email: cleanEmail,
      firstName,
      lastName,
      tags: ["bhn-signup", user.role],
      ipSignup: ip ?? null,
      timestampSignup: new Date().toISOString(),
      status: "pending",
      mergeFields: cleanJobTitle ? { JOBTITLE: cleanJobTitle } : undefined,
    });
    if (mcResult.ok) {
      mailchimpFinalStatus = mcResult.status;
      mailchimpMemberId = mcResult.memberId;
    } else {
      mailchimpFinalStatus = "error";
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mailchimpMemberId,
        mailchimpStatus: mailchimpFinalStatus,
        mailchimpSyncedAt: new Date(),
      },
    });
  }

  // Email verification: issue a token + send the link. Best-effort —
  // if SMTP isn't configured we still create the account but tell the
  // client we couldn't send the email so it can show a "request
  // resend" affordance. Account is usable in advisory mode either way.
  // The first user (superadmin) is auto-verified — they own the
  // platform; making them click an email loop on first install is
  // hostile. Everyone else has to verify.
  let emailVerificationSent = false;
  if (userCount === 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
  } else {
    const issue = await issueAndSendEmailVerification({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    emailVerificationSent = issue.sent;
  }

  await trackServer({
    userId: user.id,
    role: user.role,
    name: "register",
    props: {
      newsletterStatus,
      isFirstUser: userCount === 0,
      hasJobTitle: !!cleanJobTitle,
      locale: cleanLocale,
      emailVerificationSent,
      captchaEnabled: TURNSTILE_ENABLED,
      mailchimpStatus: mailchimpFinalStatus,
      attribution,
    },
  });

  return NextResponse.json(
    { id: user.id, email: user.email, role: user.role, emailVerificationSent },
    { status: 201 }
  );
}
