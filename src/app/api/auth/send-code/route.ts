import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";

// 10 minutes is long enough that a user can switch to their email app
// and back without rushing, short enough that a leaked code is useless.
const EXPIRY_MS = 10 * 60 * 1000;

// Per-email rate limit: at most one new code every 30 seconds. Prevents
// accidental spam if a user clicks "Send code" repeatedly.
const COOLDOWN_MS = 30 * 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  // Validate shape only here — we do NOT reveal whether the email is
  // registered. That answer is leaked timing-wise too, but a single
  // bcrypt-hash always runs to keep the response time roughly stable.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "Email login is not configured on this server." },
      { status: 503 }
    );
  }

  // Cooldown — block back-to-back sends for the same address.
  const recent = await prisma.loginCode.findFirst({
    where: { email, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
  });
  if (recent) {
    return NextResponse.json(
      { error: "A code was just sent. Check your inbox or try again in a moment." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // 6-digit code, leading-zero preserved as a string.
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  // Always store + always perform the bcrypt hash so timing doesn't
  // distinguish "user exists" from "doesn't". We just don't email if
  // the user is unknown.
  await prisma.loginCode.create({ data: { email, codeHash, expiresAt } });

  if (user) {
    try {
      await sendMail({
        to: email,
        subject: `Your BHN Training sign-in code: ${code}`,
        text: `Your sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
          <h2 style="margin:0 0 16px">Your sign-in code</h2>
          <div style="font-size:32px;font-weight:700;letter-spacing:0.2em;background:#f1f5fa;padding:16px;text-align:center;border-radius:12px;font-family:ui-monospace,monospace">${code}</div>
          <p style="color:#4b5b78;font-size:14px;margin-top:16px">Enter this code on the sign-in page. It expires in 10 minutes.</p>
          <p style="color:#8b9bb8;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
        </div>`,
      });
    } catch (e) {
      console.error("send-code mail failed", e);
      // Surface a generic error — never leak SMTP details to the client.
      return NextResponse.json(
        { error: "Couldn't send the code. Please try again." },
        { status: 502 }
      );
    }
  }

  // Always return success so an attacker can't enumerate accounts.
  return NextResponse.json({ ok: true });
}
