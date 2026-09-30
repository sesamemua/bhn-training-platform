-- BHN Promo filming day (Toronto is UTC-4 on 6 October 2026), revised:
--   * Three trainees for the lab shots, TBD 1–3, to be renamed when known.
--   * "Ruilin setting up" for the 8:30 set-up.
--   * The second box of coffee goes with lunch.
--   * Epshita and Roshni move up: each preps while the one before is
--     filmed, then films straight after. Roshni and Yeseul facilitate Epshita.
INSERT INTO "FilmingPerson" ("id", "scheduleId", "name", "group", "role")
SELECT v.id, 'filming_bhn_promo_2026_10_06', v.name, 'trainee', 'Lab shots — name to come'
FROM (VALUES ('fp_tbd1', 'TBD 1'), ('fp_tbd2', 'TBD 2'), ('fp_tbd3', 'TBD 3')) AS v(id, name)
WHERE EXISTS (SELECT 1 FROM "FilmingSchedule" WHERE "id" = 'filming_bhn_promo_2026_10_06')
ON CONFLICT DO NOTHING;

UPDATE "FilmingBlock"
SET "people" = array_cat(array_remove("people", 'fp_students'), ARRAY['fp_tbd1','fp_tbd2','fp_tbd3']), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'fb_molly_lab' AND 'fp_students' = ANY("people") AND EXISTS (SELECT 1 FROM "FilmingPerson" WHERE "id" = 'fp_tbd1');
UPDATE "FilmingBlock" SET "people" = array_remove("people", 'fp_students'), "facilitators" = array_remove("facilitators", 'fp_students')
WHERE 'fp_students' = ANY("people") OR 'fp_students' = ANY("facilitators");
DELETE FROM "FilmingPerson" WHERE "id" = 'fp_students' AND EXISTS (SELECT 1 FROM "FilmingPerson" WHERE "id" = 'fp_tbd1');

UPDATE "FilmingBlock" SET "title" = 'Ruilin setting up', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_setup_own';

UPDATE "FilmingBlock" SET "title" = 'Lunch + second box of coffee', "notes" = 'Alison orders lunch; the second box of coffee comes with it. Time to confirm.', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_lunch';
DELETE FROM "FilmingBlock" WHERE "id" = 'fb_coffee_lunch';

UPDATE "FilmingBlock" SET "start" = '2026-10-06 17:30', "end" = '2026-10-06 18:30', "facilitators" = ARRAY['fp_roshni','fp_yeseul'], "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_epshita';
UPDATE "FilmingBlock" SET "start" = '2026-10-06 18:00', "end" = '2026-10-06 19:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_roshni';

UPDATE "FilmingPerson" SET "role" = 'Interviewee · facilitator' WHERE "id" IN ('fp_roshni', 'fp_yeseul');
