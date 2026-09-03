"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface ConsentState {
  necessary: true;          // always true — required to use the platform
  analytics: boolean;
  marketing: boolean;
  version: string;
  acceptedAt: string | null;
}

const VERSION = "1.0";

const DEFAULT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  version: VERSION,
  acceptedAt: null,
};

const STORAGE_KEY = "bhn-consent";

interface ConsentValue {
  consent: ConsentState;
  hasDecided: boolean;
  // False until we've read localStorage on the client. The banner uses
  // this to avoid a flash of "undecided" UI on first paint.
  ready: boolean;
  setConsent: (c: Partial<ConsentState>) => void;
}

const ConsentContext = createContext<ConsentValue>({
  consent: DEFAULT,
  hasDecided: false,
  ready: false,
  setConsent: () => {},
});

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsentState] = useState<ConsentState>(DEFAULT);
  const [hasDecided, setHasDecided] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ConsentState;
        if (parsed?.version === VERSION) {
          setConsentState({ ...DEFAULT, ...parsed, necessary: true });
          setHasDecided(true);
        }
      }
    } catch {}
    setReady(true);
  }, []);

  function setConsent(patch: Partial<ConsentState>) {
    const next: ConsentState = {
      ...consent,
      ...patch,
      necessary: true,
      version: VERSION,
      acceptedAt: new Date().toISOString(),
    };
    setConsentState(next);
    setHasDecided(true);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    // Persist to server too
    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  }

  return <ConsentContext.Provider value={{ consent, hasDecided, ready, setConsent }}>{children}</ConsentContext.Provider>;
}

export function useConsent() { return useContext(ConsentContext); }

/** Helper for non-React code: are analytics allowed? */
export function isAnalyticsAllowed(): boolean {
  return isConsentAllowed("analytics");
}

/** Helper for advertising conversion tags: has the user opted into marketing? */
export function isMarketingAllowed(): boolean {
  return isConsentAllowed("marketing");
}

function isConsentAllowed(category: "analytics" | "marketing"): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as ConsentState;
    return !!parsed[category];
  } catch {
    return false;
  }
}
