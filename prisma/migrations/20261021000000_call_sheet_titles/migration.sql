-- BHN Promo shoot day: Ruilin is producer and DP (not director), and
-- Darek's call is 10:30 — on the call sheet and the filming day's list.
UPDATE "CallSheet"
SET "data" = jsonb_set(
      jsonb_set("data", '{people}', (
        SELECT jsonb_agg(
          CASE
            WHEN p->>'name' = 'Ruilin Yuan' THEN jsonb_set(p, '{role}', '"Producer & DP — BHN Marketing & Communications"')
            WHEN p->>'name' LIKE 'Darek%' THEN jsonb_set(p, '{call}', '"10:30"')
            ELSE p
          END ORDER BY ord)
        FROM jsonb_array_elements("data"->'people') WITH ORDINALITY AS t(p, ord)
      )),
      '{schedule}', (
        SELECT jsonb_agg(
          CASE WHEN r->>'item' LIKE 'Crew call%' THEN r || '{"time": "10:30", "end": "10:45"}'::jsonb ELSE r END ORDER BY ord)
        FROM jsonb_array_elements("data"->'schedule') WITH ORDINALITY AS t(r, ord)
      )),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'callsheet_bhn_promo_2026_10_06'
  AND jsonb_typeof("data"->'people') = 'array'
  AND jsonb_typeof("data"->'schedule') = 'array';

UPDATE "FilmingPerson" SET "role" = 'Producer & DP — set-up, camera, lab shots' WHERE "id" = 'fp_ruilin' AND "role" ILIKE '%director%';
