-- ── Fresh-database guard (added Aug 2026) ────────────────────────
-- Backdated migration: it alters/references "JobFolder", which is only
-- CREATED by a later-named migration — on production the table already
-- existed (created during development, formalised later), so this
-- applied fine; on a brand-new database the name-order replay dies here.
-- On a fresh database we skip the whole file and the tail migration
-- 20260916000000_fresh_replay_repairs recreates every skipped object
-- once its dependencies exist. Idempotent both ways.
DO $fresh_db_guard$
BEGIN
  IF to_regclass('"JobFolder"') IS NULL THEN
    RETURN;
  END IF;

-- ─────────────────────────────────────────────────────────────────
-- Job folder ↔ Simulation request link
--
-- Adds an optional FK on JobFolder pointing at SimulationRequest, so
-- a trainee can attach a role-play sim to a folder alongside the
-- existing JD / resume / cover letter / interview prep tabs. ON
-- DELETE SET NULL — deleting the request leaves the folder intact
-- so the trainee doesn't silently lose their JD + cover letter.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "JobFolder"
    ADD COLUMN "simulationRequestId" TEXT;

ALTER TABLE "JobFolder"
    ADD CONSTRAINT "JobFolder_simulationRequestId_fkey"
    FOREIGN KEY ("simulationRequestId") REFERENCES "SimulationRequest"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "JobFolder_simulationRequestId_idx"
    ON "JobFolder" ("simulationRequestId");
END
$fresh_db_guard$;
