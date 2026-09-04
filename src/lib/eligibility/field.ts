/**
 * Which answer the roster is checked against.
 *
 * Its own module, and free of Prisma, because three places need it and
 * two of them cannot import check.ts: the browser form (which checks as
 * soon as the address is typed) and the submit action (which checks
 * again, because the browser is not to be trusted). One constant so the
 * inline check and the server check can never end up asking about
 * different fields — which would show somebody a green light and then
 * refuse them at the end.
 *
 * `trainee_email` is "the email registered with BioHubNet", which is a
 * different question from where they want their confirmation sent.
 */
export const ELIGIBILITY_EMAIL_KEY = "trainee_email";
