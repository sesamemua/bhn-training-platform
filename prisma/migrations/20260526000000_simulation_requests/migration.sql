-- ─────────────────────────────────────────────────────────────────
-- SimulationRequest — admin-mediated sim generation queue
--
-- Replaces the self-serve /api/simulator/start AI generation with a
-- request → review → generate workflow. Lets admins absorb AI quota /
-- validator failures away from the user.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "SimulationRequest" (
    "id"              TEXT        NOT NULL,
    "userId"          TEXT        NOT NULL,
    "sourceUrl"       TEXT,
    "jdBody"          TEXT        NOT NULL,
    "sourceHash"      TEXT        NOT NULL,
    "status"          TEXT        NOT NULL DEFAULT 'pending',
    "simulationId"    TEXT,
    "adminNotes"      TEXT,
    "processedById"   TEXT,
    "processedAt"     TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SimulationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SimulationRequest_status_createdAt_idx"
    ON "SimulationRequest" ("status", "createdAt");

CREATE INDEX "SimulationRequest_userId_status_idx"
    ON "SimulationRequest" ("userId", "status");

CREATE INDEX "SimulationRequest_sourceHash_idx"
    ON "SimulationRequest" ("sourceHash");

ALTER TABLE "SimulationRequest"
    ADD CONSTRAINT "SimulationRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Guarded (Aug 2026): "Simulation" is created by a later-named migration;
-- on a fresh database this FK is added by 20260916000000_fresh_replay_repairs.
DO $fk_guard$
BEGIN
  IF to_regclass('"Simulation"') IS NOT NULL THEN
    ALTER TABLE "SimulationRequest"
        ADD CONSTRAINT "SimulationRequest_simulationId_fkey"
        FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$fk_guard$;

ALTER TABLE "SimulationRequest"
    ADD CONSTRAINT "SimulationRequest_processedById_fkey"
    FOREIGN KEY ("processedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
