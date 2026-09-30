-- Three student interviews on the BHN Promo day (Toronto is UTC-4 on
-- 6 October 2026). Their time is not fixed — 9:30–10:30 or after 5 — so
-- they are laid in the morning slot as flexible: 15 minutes of prep, then
-- 20 minutes each on camera, back to back from 9:30.
INSERT INTO "FilmingBlock" ("id", "scheduleId", "kind", "title", "notes", "start", "end", "prepMinutes", "flexible", "people", "updatedAt")
SELECT v.id, 'filming_bhn_promo_2026_10_06', 'interview', v.title, 'Either 9:30–10:30 or after 5 p.m. — not fixed yet.', v.s::timestamp, v.e::timestamp, 15, true, ARRAY[v.who], CURRENT_TIMESTAMP
FROM (VALUES
  ('fb_student1', 'Interview — student TBD 1', 'fp_tbd1', '2026-10-06 13:15', '2026-10-06 13:50'),
  ('fb_student2', 'Interview — student TBD 2', 'fp_tbd2', '2026-10-06 13:35', '2026-10-06 14:10'),
  ('fb_student3', 'Interview — student TBD 3', 'fp_tbd3', '2026-10-06 13:55', '2026-10-06 14:30')
) AS v(id, title, who, s, e)
WHERE EXISTS (SELECT 1 FROM "FilmingPerson" WHERE "id" = v.who)
ON CONFLICT DO NOTHING;

UPDATE "FilmingPerson" SET "role" = 'Student — interview and lab shots' WHERE "id" IN ('fp_tbd1', 'fp_tbd2', 'fp_tbd3');
