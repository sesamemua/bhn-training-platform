import Link from "next/link";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { REGISTRATION_CONTACT_EMAIL } from "@/lib/auth/registration";

/**
 * What /register shows while public sign-up is closed. Same card and
 * backdrop as the sign-up form, so a bookmarked link lands somewhere
 * familiar. No hooks — it renders on the server.
 *
 * `signInHref` is built by the page so the visitor's callbackUrl and
 * campaign parameters survive the trip to /login.
 */
export function RegistrationClosed({ signInHref }: { signInHref: string }) {
  const mailto = `mailto:${REGISTRATION_CONTACT_EMAIL}?subject=${encodeURIComponent("BHN Training access")}`;
  return (
    <main
      data-registration-closed
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-card to-brand-100 px-4 py-8"
    >
      <div className="w-full max-w-md">
        <Link href="/login" className="flex justify-center mb-8">
          <Logo size="lg" />
        </Link>

        <div className="bg-card rounded-2xl shadow-xl shadow-brand-900/5 border border-line p-8">
          <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
            <Lock size={22} aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-fg">Registration is closed</h1>
          <p className="text-muted text-sm mt-1.5 leading-relaxed">
            BHN Training is invite-only right now, so new accounts can&apos;t be created here.
            If you already have an account, sign in as usual.
          </p>

          <Link
            href={signInHref}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-md shadow-brand-600/25 text-sm"
          >
            Sign in <ArrowRight size={14} aria-hidden />
          </Link>

          <div className="mt-6 rounded-xl border border-line bg-elevated/40 p-3.5 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-fg">
              <Mail size={14} aria-hidden className="text-brand-600" />
              Need access?
            </p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Email the BioHubNet team at{" "}
              <a href={mailto} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                {REGISTRATION_CONTACT_EMAIL}
              </a>{" "}
              and we&apos;ll set you up. Got a team invite link? Open it again — it still lets you
              create your account.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
