-- ── Fresh-database guard (added Aug 2026) ────────────────────────
-- This migration is a one-time cleanup of demo/sandbox data. Its
-- timestamp (May 13) predates 20260516000000_sandbox_and_demo_accounts,
-- which CREATES the "accountKind" column it filters on — the file was
-- written later and backdated, so on a brand-new database the name-order
-- replay hits a column that doesn't exist yet and the whole chain dies.
-- (Found while standing up the portfolio-demo deployment; production
-- never noticed because the column already existed when this applied.)
--
-- On a fresh database there is nothing to clean, so the correct
-- behaviour is to no-op. On any database where the column exists the
-- original statements run unchanged — they are idempotent by design.
DO $fresh_db_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'accountKind'
  ) THEN
    RETURN;
  END IF;

-- Retire the "sandbox" accountKind.
--
-- The sandbox-account feature was an admin-only dummy HR + Trainee
-- pair admins could log into for "what does this look like as a
-- learner / employer" testing. We're replacing it with the new
-- /admin/split-view tool (side-by-side HR + Trainee panels) so
-- admins don't need to log out of their own seat at all.
--
-- This migration converts every existing sandbox account to a demo
-- account. Demo accounts have a TTL + auto-cleanup story already
-- in place, so the leftover rows fold cleanly into the existing
-- demo lifecycle. Nothing is deleted here — the row's history,
-- foreign keys, and dependent data (enrollments / submissions /
-- credit applications etc.) all stay intact.
--
-- Idempotent. After the first run no rows match and the UPDATE is
-- a no-op.

UPDATE "User"
SET "accountKind" = 'demo',
    "demoExpiresAt" = COALESCE(
      "demoExpiresAt",
      CURRENT_TIMESTAMP + INTERVAL '30 days'
    )
WHERE "accountKind" = 'sandbox';
END
$fresh_db_guard$;
