/**
 * /register — decided on the server.
 *
 *   • Sign-up open (REGISTRATION_OPEN=true, or the demo deployment)
 *       → the sign-up form, exactly as before.
 *   • Sign-up closed, but callbackUrl is a live /invite/<token>
 *       → the form, fixed to the invited address, so a new teammate can
 *         still accept a company invite.
 *   • Otherwise → "Registration is closed", with a Sign in link that
 *     keeps callbackUrl and the campaign parameters.
 */
import { RegistrationClosed } from "@/components/auth/RegistrationClosed";
import {
  inviteAllowsRegistration,
  inviteTokenFromPath,
  isRegistrationOpen,
} from "@/lib/auth/registration";
import { findRegistrationInvite } from "@/lib/auth/registration-invite";
import {
  campaignAttributionFromRecord,
  campaignAuthUrl,
  safeInternalPath,
} from "@/lib/campaign/attribution";
import { RegisterForm } from "./RegisterForm";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RegisterPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (isRegistrationOpen()) return <RegisterForm />;

  const query = await searchParams;
  const callbackUrl = safeInternalPath(first(query.callbackUrl));

  const token = inviteTokenFromPath(callbackUrl);
  if (token) {
    const invite = await findRegistrationInvite(token);
    // Checked against the invite's own address: the form is then fixed to it.
    if (invite && inviteAllowsRegistration(invite, invite.email)) {
      return (
        <RegisterForm
          invite={{ token: invite.token, email: invite.email, companyName: invite.companyName }}
        />
      );
    }
  }

  const signInHref = campaignAuthUrl("login", callbackUrl, campaignAttributionFromRecord(query));
  return <RegistrationClosed signInHref={signInHref} />;
}
