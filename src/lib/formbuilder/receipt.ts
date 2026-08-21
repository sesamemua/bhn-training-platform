/**
 * What happened to the acknowledgement email.
 *
 * Reported rather than swallowed. A registrant who is told "we have
 * emailed you" and receives nothing waits, then chases, then registers
 * again — so the confirmation screen says which of these it was, and a
 * coordinator testing the form can see the letter even when the mail
 * server is not configured.
 */
export type Receipt =
  /** Gone to the registrant. */
  | { state: "sent"; preview: SentMail }
  /** A test: gone to the person running it, never to the form's address. */
  | { state: "sent-to-you"; preview: SentMail }
  /** No SMTP on this deployment. The letter is shown instead. */
  | { state: "not-configured"; preview: SentMail }
  /** Tried and refused. */
  | { state: "failed"; why: string; preview: SentMail }
  /** Nothing to send to — the form has no address on it. */
  | { state: "no-address" }
  /** The letter has been deleted from the standing letters. */
  | { state: "no-template" }
  /** A merge field with nothing to put in it: better no letter than that. */
  | { state: "unfilled"; missing: string[] };

export interface SentMail {
  to: string;
  subject: string;
  body: string;
}

/** One line, for the confirmation screen. */
export function receiptLine(r: Receipt | undefined): string {
  switch (r?.state) {
    case "sent": return `A confirmation is on its way to ${r.preview.to}.`;
    case "sent-to-you": return `This was a test, so the confirmation went to you at ${r.preview.to} rather than to the address on the form.`;
    case "not-configured": return "No email was sent — this deployment has no mail server configured. The letter is below.";
    case "failed": return `The confirmation could not be sent (${r.why}). Your registration is safely recorded.`;
    case "no-address": return "No email was sent — there is no address on this registration.";
    case "no-template": return "No email was sent — the “Registration received” letter has been deleted.";
    case "unfilled": return `No email was sent — the letter has nothing to put in ${r.missing.map((m) => `{{${m}}}`).join(", ")}.`;
    default: return "";
  }
}
