import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRegistrationOpen, registrationClosedResponse } from "@/lib/auth/registration";

// LTI 1.3 Launch endpoint — validates JWT and redirects to course
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const idToken = formData.get("id_token") as string;
  const state = formData.get("state") as string;

  if (!idToken || !state) {
    return NextResponse.json({ error: "Missing id_token or state" }, { status: 400 });
  }

  // Decode JWT header to find issuer/kid
  try {
    const [headerB64, payloadB64] = idToken.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString());

    const iss = payload.iss;
    const clientId = payload.aud;

    const config = await prisma.ltiConfig.findFirst({
      where: { issuer: iss, clientId, active: true },
    });

    if (!config) {
      return NextResponse.json({ error: "Unknown LTI platform" }, { status: 403 });
    }

    // In production: validate JWT signature against JWKS
    // For now: extract claims and redirect to course
    const resourceLink = payload["https://purl.imsglobal.org/spec/lti/claim/resource_link"];
    const courseId = resourceLink?.id;
    const userEmail = payload.email;
    const userName = payload.name;

    if (!userEmail) {
      return NextResponse.json({ error: "No email in LTI claim" }, { status: 400 });
    }

    // Auto-provision user
    let user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      // The id_token is not signature-checked yet (see above), so anyone
      // could forge one. While sign-up is closed only existing accounts
      // may launch; nobody gets a new one this way.
      if (!isRegistrationOpen()) return registrationClosedResponse();
      user = await prisma.user.create({
        data: { email: userEmail, name: userName, role: "learner" },
      });
    }

    // Auto-enroll
    if (courseId) {
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId: user.id, courseId } },
        update: {},
        create: { userId: user.id, courseId, status: "active" },
      });
    }

    const redirectUrl = courseId
      ? `/courses/${courseId}?lti=1`
      : "/dashboard";

    return NextResponse.redirect(new URL(redirectUrl, req.url));
  } catch {
    return NextResponse.json({ error: "Invalid LTI token" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const iss = searchParams.get("iss");
  const loginHint = searchParams.get("login_hint");
  const targetLinkUri = searchParams.get("target_link_uri");

  // OIDC login initiation — redirect to platform auth endpoint
  const config = iss
    ? await prisma.ltiConfig.findFirst({ where: { issuer: iss, active: true } })
    : null;

  if (!config) {
    return NextResponse.json({ error: "Unknown issuer" }, { status: 400 });
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const authUrl = new URL(config.authEndpoint);
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", `${process.env.NEXTAUTH_URL}/api/lti/launch`);
  authUrl.searchParams.set("login_hint", loginHint ?? "");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "none");
  if (targetLinkUri) authUrl.searchParams.set("lti_message_hint", targetLinkUri);

  return NextResponse.redirect(authUrl.toString());
}
