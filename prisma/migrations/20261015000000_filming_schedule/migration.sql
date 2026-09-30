-- Filming day: tasks on a timeline, people dragged onto them.
CREATE TABLE "FilmingSchedule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "opensAt" TEXT NOT NULL DEFAULT '08:30',
    "closesAt" TEXT NOT NULL DEFAULT '17:00',
    "notes" TEXT NOT NULL DEFAULT '',
    "openFrom" TEXT NOT NULL DEFAULT '09:00',
    "openTo" TEXT NOT NULL DEFAULT '17:00',
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "prepMinutes" INTEGER NOT NULL DEFAULT 30,
    "bookingToken" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FilmingSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FilmingPerson" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'team',
    "role" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FilmingPerson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FilmingBlock" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'logistics',
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "prepMinutes" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "flexible" BOOLEAN NOT NULL DEFAULT false,
    "people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FilmingBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FilmingSchedule_projectId_key" ON "FilmingSchedule"("projectId");
CREATE UNIQUE INDEX "FilmingSchedule_bookingToken_key" ON "FilmingSchedule"("bookingToken");
CREATE INDEX "FilmingPerson_scheduleId_idx" ON "FilmingPerson"("scheduleId");
CREATE INDEX "FilmingBlock_scheduleId_start_idx" ON "FilmingBlock"("scheduleId", "start");

ALTER TABLE "FilmingSchedule" ADD CONSTRAINT "FilmingSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FilmingPerson" ADD CONSTRAINT "FilmingPerson_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FilmingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FilmingBlock" ADD CONSTRAINT "FilmingBlock_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "FilmingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The BHN Promo shoot day, Tuesday 6 October 2026. Toronto is UTC-4 that
-- day, so 08:30 local is 12:30 UTC. Times the team has not fixed yet are
-- tentative and say so; Darius and Gilbert are pinned.
INSERT INTO "FilmingSchedule" ("id", "projectId", "title", "date", "location", "opensAt", "closesAt", "notes", "updatedAt")
SELECT 'filming_bhn_promo_2026_10_06', p."id", 'BioHubNet Promo Video — filming day', DATE '2026-10-06',
       'Fitzgerald Building Atrium, 150 College Street', '08:30', '17:00',
       'The building is open 8:30 AM – 5:00 PM. If anyone steps out after 5:00, one person stays inside to open the door for them — nobody gets locked out.',
       CURRENT_TIMESTAMP
FROM "VideoProject" p WHERE p."title" = 'BHN Promo Video Project'
ORDER BY p."createdAt" LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO "FilmingPerson" ("id", "scheduleId", "name", "group", "role")
SELECT v.id, 'filming_bhn_promo_2026_10_06', v.name, v.grp, v.role
FROM (VALUES
  ('fp_ruilin',  'Ruilin',  'team',        'Producer & director — set-up, camera, B-roll'),
  ('fp_alison',  'Alison',  'team',        'Support — lunch & logistics'),
  ('fp_yoojin',  'Yoo Jin', 'team',        'Interviewee · support'),
  ('fp_yeseul',  'Yeseul',  'team',        'Interviewee · support'),
  ('fp_epshita', 'Epshita', 'team',        'Interviewee · support'),
  ('fp_roshni',  'Roshni',  'team',        'Interviewee · support'),
  ('fp_darek',   'Darek',   'crew',        'Sound & lighting (contractor) — arrives 10:30'),
  ('fp_darius',  'Darius',  'interviewee', 'Interview 11:30'),
  ('fp_gilbert', 'Gilbert', 'interviewee', 'Interview 12:00'),
  ('fp_molly',   'Molly',   'interviewee', 'Interview + lab session with her students')
) AS v(id, name, grp, role)
WHERE EXISTS (SELECT 1 FROM "FilmingSchedule" WHERE "id" = 'filming_bhn_promo_2026_10_06')
ON CONFLICT DO NOTHING;

INSERT INTO "FilmingBlock" ("id", "scheduleId", "kind", "title", "notes", "start", "end", "prepMinutes", "locked", "flexible", "people", "updatedAt")
SELECT v.id, 'filming_bhn_promo_2026_10_06', v.kind, v.title, v.notes, v.s::timestamp, v.e::timestamp, v.prep, v.locked, v.flex, v.people, CURRENT_TIMESTAMP
FROM (VALUES
  ('fb_setup_own',  'setup',     'Set up camera, sound & lighting',              'Ruilin brings the camera. About an hour.',                                      '2026-10-06 12:30', '2026-10-06 13:30', 0,  false, false, ARRAY['fp_ruilin']),
  ('fb_meet_darek', 'logistics', 'Meet the sound & lighting contractor outside',  'Somebody waits outside at 10:30 to bring Darek in — drag them here.',           '2026-10-06 14:30', '2026-10-06 14:45', 0,  false, false, ARRAY[]::TEXT[]),
  ('fb_setup_darek','setup',     'Sound & lighting set-up with the contractor',   'About an hour, ready for Darius at 11:30.',                                    '2026-10-06 14:30', '2026-10-06 15:30', 0,  false, false, ARRAY['fp_ruilin','fp_darek']),
  ('fb_darius',     'interview', 'Interview — Darius',                            '',                                                                              '2026-10-06 15:30', '2026-10-06 16:00', 0,  true,  false, ARRAY['fp_darius','fp_ruilin','fp_darek']),
  ('fb_gilbert',    'interview', 'Interview — Gilbert',                           '',                                                                              '2026-10-06 16:00', '2026-10-06 16:30', 0,  true,  false, ARRAY['fp_gilbert','fp_ruilin','fp_darek']),
  ('fb_lunch',      'logistics', 'Lunch — order and set out',                     'Time to confirm.',                                                              '2026-10-06 16:00', '2026-10-06 16:30', 0,  false, true,  ARRAY['fp_alison']),
  ('fb_yoojin',     'interview', 'Interview — Yoo Jin',                           'Tentative time.',                                                               '2026-10-06 17:00', '2026-10-06 17:30', 0,  false, false, ARRAY['fp_yoojin','fp_ruilin','fp_darek']),
  ('fb_yeseul',     'interview', 'Interview — Yeseul',                            'Tentative time.',                                                               '2026-10-06 17:30', '2026-10-06 18:00', 0,  false, false, ARRAY['fp_yeseul','fp_ruilin','fp_darek']),
  ('fb_molly_lab',  'lab',       'Molly — lab session with students',             'About 30 minutes. Students not decided yet; time not fixed.',                   '2026-10-06 18:00', '2026-10-06 18:30', 0,  false, true,  ARRAY['fp_molly','fp_ruilin']),
  ('fb_epshita',    'interview', 'Interview — Epshita',                           'Tentative time.',                                                               '2026-10-06 18:30', '2026-10-06 19:00', 0,  false, false, ARRAY['fp_epshita','fp_ruilin','fp_darek']),
  ('fb_roshni',     'interview', 'Interview — Roshni',                            'Tentative time.',                                                               '2026-10-06 19:00', '2026-10-06 19:30', 0,  false, false, ARRAY['fp_roshni','fp_ruilin','fp_darek']),
  ('fb_broll',      'broll',     'B-roll',                                        'Tentative time.',                                                               '2026-10-06 19:30', '2026-10-06 20:00', 0,  false, true,  ARRAY['fp_ruilin']),
  ('fb_molly',      'interview', 'Interview — Molly',                             'Drop-in 1:30–3:00 PM or 4:00–5:00 PM; most likely 4–5. First half hour is preparation.', '2026-10-06 20:00', '2026-10-06 21:00', 30, false, true,  ARRAY['fp_molly','fp_ruilin','fp_darek'])
) AS v(id, kind, title, notes, s, e, prep, locked, flex, people)
WHERE EXISTS (SELECT 1 FROM "FilmingSchedule" WHERE "id" = 'filming_bhn_promo_2026_10_06')
ON CONFLICT DO NOTHING;
