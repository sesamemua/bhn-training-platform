-- Additive metadata only. Do not re-number existing versions or comments.
ALTER TABLE "PageReview" ADD COLUMN "teamRound" INTEGER,
  ADD COLUMN "teamRoundStartedAt" TIMESTAMP(3);

-- The old newsletter workflow logged explicit pending -> open transitions
-- at the SAME saved version. Do not count open -> open saves, or infer
-- additional historical handoffs where no opening is recorded.
WITH states AS (
  SELECT r.id, f."occurredAt", f."recordedAt", f.id AS event_id,
    f.detail::jsonb #>> '{source,context,status}' AS status,
    f.detail::jsonb #>> '{source,context,round}' AS version
  FROM "PageReview" r JOIN "ReviewFeedbackMemory" f ON f."reviewId"=r.id
  WHERE r.id LIKE 'newsletter-%' AND r.status IN ('open','exported','closed')
    AND f.detail::jsonb #>> '{source,model}'='PageReview'
    AND f.detail::jsonb #>> '{source,context,status}' IN ('pending','open','exported','closed')
), sequenced AS (
  SELECT *, row_number() OVER review_events AS seq,
    lag(status) OVER review_events AS previous_status,
    lag(version) OVER review_events AS previous_version
  FROM states
  WINDOW review_events AS (PARTITION BY id ORDER BY "occurredAt","recordedAt",event_id)
), verified AS (
  SELECT id, count(*)::integer AS team_round, max("occurredAt") AS opened_at
  FROM sequenced
  WHERE status='open' AND (seq=1 OR (previous_status='pending' AND previous_version=version))
  GROUP BY id
)
UPDATE "PageReview" r
SET "teamRound"=v.team_round, "teamRoundStartedAt"=v.opened_at
FROM verified v WHERE r.id=v.id AND r."teamRound" IS NULL;
