/**
 * POST /api/scripts/collaborator/convert
 * P4 of the Video Production plan: when an anonymous script collaborator
 * reaches 3 edits they can create a BHN account. On success the collaborator
 * row is stamped (convertedUserId) and a confirmation email is sent with a
 * link back to the script they were editing.
 *
 * Body: { email, password, scriptUrl }
 * Auth: the existing collaborator cookie (getCollaborator reads it).
 * 403 while public sign-up is closed (lib/auth/registration).
 * The scriptUrl is a full URL that the confirmation email links back to.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCollaborator } from "@/lib/scripts/share";
import { checkPassword } from "@/lib/security/password-policy";
import { sendMail, mailConfigured } from "@/lib/mail";
import { isRegistrationOpen, registrationClosedResponse } from "@/lib/auth/registration";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  scriptUrl: z.string().url().optional(),
  scriptId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // A script share link is not an invitation to the platform: while
  // sign-up is closed this refuses before reading the cookie or the body.
  if (!isRegistrationOpen()) return registrationClosedResponse();

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { email, password, scriptUrl, scriptId } = parsed.data;

  const collab = await getCollaborator(scriptId);
  if (!collab) return NextResponse.json({ error: "No active collaboration session." }, { status: 401 });
  if (collab.convertedUserId) return NextResponse.json({ error: "Already converted." }, { status: 409 });

  // Password policy check.
  const pwCheck = checkPassword({ password, email, name: collab.name });
  if (!pwCheck.ok) return NextResponse.json({ error: pwCheck.reason ?? "Password not accepted." }, { status: 422 });

  // Email uniqueness.
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "An account with that email already exists. Try signing in." }, { status: 409 });

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name: collab.name,
      password: hashed,
      role: "trainee",
      emailVerified: null,
    },
    select: { id: true, email: true, name: true },
  });

  await prisma.scriptCollaborator.update({
    where: { id: collab.id },
    data: { email: user.email, convertedUserId: user.id },
  }).catch(() => {});

  if (mailConfigured() && scriptUrl) {
    await sendMail({
      to: user.email,
      subject: "You're in — your BHN account is ready",
      text: [
        `Hi ${user.name},`,
        "",
        "Your BHN Training Platform account has been created.",
        scriptUrl ? `Here's a link back to the script you were editing: ${scriptUrl}` : "",
        "",
        "You can sign in at any time at bhn-training-platform.vercel.app.",
        "",
        "— The BHN Team",
      ].filter(Boolean).join("\n"),
      html: [
        `<p>Hi ${user.name},</p>`,
        "<p>Your BHN Training Platform account has been created.</p>",
        scriptUrl ? `<p><a href="${scriptUrl}">Click here to return to the script you were editing.</a></p>` : "",
        "<p>You can <a href='https://bhn-training-platform.vercel.app/login'>sign in</a> at any time.</p>",
        "<p>— The BHN Team</p>",
      ].filter(Boolean).join(""),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
