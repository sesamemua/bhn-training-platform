/**
 * The name a registrant gave on the registration form.
 *
 * v2 asks "Full name" (full_name); v1 asked first and last name; older
 * rows carry trainee_name. Empty when they gave none — callers fall back
 * to an account with the same email, then the email itself. Never the
 * roster's "name" column, which on the ENGAGE/EXPERIENCE import holds the
 * institution.
 */
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function registrantName(answers: Record<string, unknown> | null | undefined): string {
  const a = answers ?? {};
  return s(a.full_name) || [s(a.first_name), s(a.last_name)].filter(Boolean).join(" ") || s(a.trainee_name);
}
