-- Interviews get facilitators, kept apart from who is on camera.
ALTER TABLE "FilmingBlock" ADD COLUMN "facilitators" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The BHN Promo day, revised (Toronto is UTC-4 on 6 October 2026):
--   * Ruilin and Darek are no longer listed on every interview.
--   * Every interview leads with 30 minutes of prep & make-up; the
--     filming times stay where they were.
--   * Facilitators: Yoo Jin and Epshita for Darius and Gilbert, Epshita for
--     Yoo Jin, Epshita and Yoo Jin for Yeseul.
--   * Lab shots with Molly's students (not decided yet) during lunch;
--     B-roll dropped; two coffee deliveries.
-- Each row is only touched if it is still there.
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_darius'],  "facilitators" = ARRAY['fp_yoojin','fp_epshita'], "prepMinutes" = 30, "start" = '2026-10-06 15:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_darius';
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_gilbert'], "facilitators" = ARRAY['fp_yoojin','fp_epshita'], "prepMinutes" = 30, "start" = '2026-10-06 15:30', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_gilbert';
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_yoojin'],  "facilitators" = ARRAY['fp_epshita'],             "prepMinutes" = 30, "start" = '2026-10-06 16:30', "end" = '2026-10-06 17:30', "notes" = 'Tentative time.', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_yoojin';
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_yeseul'],  "facilitators" = ARRAY['fp_epshita','fp_yoojin'], "prepMinutes" = 30, "start" = '2026-10-06 17:00', "end" = '2026-10-06 18:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_yeseul';
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_epshita'], "prepMinutes" = 30, "start" = '2026-10-06 18:00', "end" = '2026-10-06 19:00', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_epshita';
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_roshni'],  "prepMinutes" = 30, "start" = '2026-10-06 18:30', "end" = '2026-10-06 19:30', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_roshni';
UPDATE "FilmingBlock" SET "people" = ARRAY['fp_molly'], "notes" = 'Drop-in 1:30–3:00 PM or 4:00–5:00 PM; most likely 4–5.', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_molly';

UPDATE "FilmingBlock" SET "kind" = 'meal', "title" = 'Lunch', "start" = '2026-10-06 16:30', "end" = '2026-10-06 17:30', "notes" = 'Alison orders and sets it out. Time to confirm.', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'fb_lunch';

INSERT INTO "FilmingPerson" ("id", "scheduleId", "name", "group", "role")
SELECT 'fp_students', 'filming_bhn_promo_2026_10_06', 'Molly''s students (TBD)', 'trainee', 'Lab shots — who is not decided yet'
WHERE EXISTS (SELECT 1 FROM "FilmingSchedule" WHERE "id" = 'filming_bhn_promo_2026_10_06')
ON CONFLICT DO NOTHING;
UPDATE "FilmingBlock" SET "title" = 'Lab shots — Molly''s lab, with students', "kind" = 'lab', "flexible" = false,
  "start" = '2026-10-06 16:30', "end" = '2026-10-06 17:00', "people" = ARRAY['fp_molly','fp_ruilin','fp_students'],
  "notes" = 'During lunch. Students not decided yet.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'fb_molly_lab' AND EXISTS (SELECT 1 FROM "FilmingPerson" WHERE "id" = 'fp_students');

DELETE FROM "FilmingBlock" WHERE "id" = 'fb_broll';

INSERT INTO "FilmingBlock" ("id", "scheduleId", "kind", "title", "notes", "start", "end", "people", "updatedAt")
SELECT v.id, 'filming_bhn_promo_2026_10_06', 'meal', v.title, v.notes, v.s::timestamp, v.e::timestamp, ARRAY['fp_alison'], CURRENT_TIMESTAMP
FROM (VALUES
  ('fb_coffee_am',    'Morning coffee delivered',       'Delivered by 11:15.', '2026-10-06 15:00', '2026-10-06 15:15'),
  ('fb_coffee_lunch', 'Second box of coffee delivered', 'Arrives with lunch.', '2026-10-06 16:30', '2026-10-06 16:45')
) AS v(id, title, notes, s, e)
WHERE EXISTS (SELECT 1 FROM "FilmingPerson" WHERE "id" = 'fp_alison')
ON CONFLICT DO NOTHING;

UPDATE "FilmingPerson" SET "role" = 'Producer & director — set-up, camera, lab shots' WHERE "id" = 'fp_ruilin';
UPDATE "FilmingPerson" SET "role" = 'Support — coffee, lunch & logistics' WHERE "id" = 'fp_alison';
UPDATE "FilmingPerson" SET "role" = 'Interview + lab shots with her students' WHERE "id" = 'fp_molly';
UPDATE "FilmingPerson" SET "role" = 'Interviewee · facilitator' WHERE "id" IN ('fp_yoojin', 'fp_epshita');
