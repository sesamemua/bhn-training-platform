/**
 * Who an EQUIP application belongs to.
 *
 * There are two kinds now. One has a platform account and the User row
 * is the truth. The other arrived on the public VentureConnect link and
 * has no account at all, so the name and address it was filled in with
 * are the only identity there is.
 *
 * Every screen that shows an applicant goes through here, so the two
 * cannot drift and no caller has to remember that `user` is nullable.
 */

export interface ApplicantSource {
  user?: { name?: string | null; email?: string | null } | null;
  applicantName?: string | null;
  applicantEmail?: string | null;
}

export interface Applicant {
  name: string;
  /** Empty only if a public application somehow got in without one,
   *  which submit refuses — so callers may treat it as present. */
  email: string;
  /** True when there is no platform account behind this. Worth showing:
   *  an admin messaging them cannot rely on an in-platform inbox. */
  isGuest: boolean;
}

export function applicantOf(app: ApplicantSource): Applicant {
  if (app.user) {
    return {
      name: app.user.name?.trim() || app.user.email?.trim() || "Unnamed applicant",
      email: app.user.email?.trim() ?? "",
      isGuest: false,
    };
  }
  return {
    name: app.applicantName?.trim() || app.applicantEmail?.trim() || "Unnamed applicant",
    email: app.applicantEmail?.trim() ?? "",
    isGuest: true,
  };
}
