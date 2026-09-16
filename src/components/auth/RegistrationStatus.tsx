"use client";

import { createContext, useContext } from "react";

/**
 * Hands the server's sign-up decision to client pages that cannot take
 * it as a prop (the login page is a client page.tsx). REGISTRATION_OPEN
 * is server-only, so a layout reads it and wraps the page in this.
 * Defaults to closed: a page rendered without the provider never offers
 * sign-up by accident.
 */
const RegistrationOpenContext = createContext(false);

export function RegistrationStatusProvider({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return <RegistrationOpenContext.Provider value={open}>{children}</RegistrationOpenContext.Provider>;
}

export function useRegistrationOpen(): boolean {
  return useContext(RegistrationOpenContext);
}
