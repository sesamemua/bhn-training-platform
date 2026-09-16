import { RegistrationStatusProvider } from "@/components/auth/RegistrationStatus";
import { isRegistrationOpen } from "@/lib/auth/registration";

/**
 * The login page is a client component, so it cannot read the server-only
 * sign-up switch itself. This layout reads it and passes it down; the page
 * hides "Create your free account" while sign-up is closed.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <RegistrationStatusProvider open={isRegistrationOpen()}>{children}</RegistrationStatusProvider>;
}
