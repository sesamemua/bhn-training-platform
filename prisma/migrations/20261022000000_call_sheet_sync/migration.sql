-- BHN Promo shoot day, the call sheet in step with the code: Ruilin as
-- producer and DP, Darek's call and crew-call row at 10:30. The previous
-- migration already made these edits where it ran; this one is the
-- sheet as it is in src/lib/video/call-sheet.ts, and safe to run again.

-- 1. The sheet as it is in code (src/lib/video/call-sheet.ts), if nobody
--    has edited it since it was seeded (Darek still called for 08:00 —
--    after the previous migration this matches nothing, and is a no-op).
UPDATE "CallSheet"
SET "data" = '{"production":"BHN Promo Video — homepage, pillar and Symposium videos","dayLabel":"Day 1 of 1","generalCall":"08:00","wrap":"17:00","locationName":"U of T St. George campus — lab and interview room TBC","locationAddress":"Toronto, ON","locationNotes":"Interviews in one room; lab B-roll with students. Confirm the rooms, power and access with the lab before Friday 2 Oct.","parking":"Landmark Garage, 35 Hart House Circle (under King''s College Circle). Enter from Wellesley St. West only. Two spots: Ruilin''s car and Darek''s truck.","meals":"Coffee on arrival (Tim Hortons). Lunch at 12:15 for 10.","hospital":"Toronto General Hospital — Emergency, 200 Elizabeth St. In an emergency call 911.","weather":"Check the forecast on Monday 5 Oct.","equipment":"","notes":"Everyone on camera signs a filming release before they are filmed.\nThree pieces are shot today: the BHN homepage video (the Scientific Directors on the initiative, Yoo Jin on the three pillars), the pillar videos (ENGAGE, EXPERIENCE, EQUIP), and Symposium content — each pillar lead''s highlights of the year and the Scientific Directors'' Year in Review lines.\nScripts and prompts: Workspace → Video Production → BHN Promo Video.","people":[{"name":"Molly","role":"Scientific Director — homepage video lead voice; Year in Review","group":"talent","call":"09:15","phone":"","email":"","notes":"09:30–11:00: interview, Year in Review lines, lab B-roll"},{"name":"Epshita Islam","role":"ENGAGE pillar lead — pillar video; year highlights","group":"talent","call":"10:45","phone":"","email":"","notes":"11:00–11:25"},{"name":"Yeseul Lee","role":"EXPERIENCE pillar lead — pillar video; year highlights","group":"talent","call":"11:10","phone":"","email":"","notes":"11:25–11:50"},{"name":"Roshni","role":"EQUIP pillar lead — pillar video; year highlights","group":"talent","call":"11:35","phone":"","email":"","notes":"11:50–12:15"},{"name":"Gilbert","role":"Scientific Director — homepage video; Year in Review","group":"talent","call":"12:45","phone":"","email":"","notes":"13:00–13:30"},{"name":"Darius","role":"Scientific Director — homepage video; Year in Review","group":"talent","call":"13:15","phone":"","email":"","notes":"13:30–14:00"},{"name":"Yoo Jin","role":"Homepage video — the three pillars","group":"talent","call":"13:45","phone":"","email":"","notes":"14:00–14:30"},{"name":"Ruilin Yuan","role":"Producer & DP — BHN Marketing & Communications","group":"crew","call":"07:30","phone":"","email":"ruilin.yuan@utoronto.ca","notes":"Parking, coffee, releases"},{"name":"Darek Zdzienicki","role":"Sound & lighting — CamArt Productions","group":"crew","call":"10:30","phone":"","email":"","notes":"Truck parks at Landmark Garage"},{"name":"Alison","role":"BHN team","group":"team","call":"12:15","phone":"","email":"","notes":"Lunch"}],"schedule":[{"time":"07:30","end":"08:00","item":"Producer on site — parking, coffee, releases","who":"Ruilin","notes":""},{"time":"10:30","end":"10:45","item":"Crew call — load in from Landmark Garage","who":"Darek","notes":""},{"time":"08:15","end":"09:30","item":"Set lights, sound and camera; test shots","who":"Ruilin, Darek","notes":""},{"time":"09:30","end":"10:15","item":"Molly — homepage video interview","who":"Molly","notes":"Guide → Molly tab"},{"time":"10:15","end":"10:40","item":"Molly — Year in Review lines","who":"Molly","notes":"Guide → Year in Review tab"},{"time":"10:40","end":"11:00","item":"Molly — B-roll in the lab with students","who":"Molly, students","notes":""},{"time":"11:00","end":"11:25","item":"ENGAGE — pillar video + year highlights","who":"Epshita","notes":"Guide → Pillar leads → ENGAGE"},{"time":"11:25","end":"11:50","item":"EXPERIENCE — pillar video + year highlights","who":"Yeseul","notes":"Guide → Pillar leads → EXPERIENCE"},{"time":"11:50","end":"12:15","item":"EQUIP — pillar video + year highlights","who":"Roshni","notes":"Guide → Pillar leads → EQUIP"},{"time":"12:15","end":"13:00","item":"Lunch","who":"All (10)","notes":""},{"time":"13:00","end":"13:30","item":"Gilbert — homepage video + Year in Review lines","who":"Gilbert","notes":""},{"time":"13:30","end":"14:00","item":"Darius — homepage video + Year in Review lines","who":"Darius","notes":""},{"time":"14:00","end":"14:30","item":"Yoo Jin — homepage video: the three pillars","who":"Yoo Jin","notes":"Guide → Yoo Jin tab"},{"time":"14:30","end":"16:15","item":"B-roll — lab, corridors, exteriors; pickups","who":"Ruilin, Darek","notes":""},{"time":"16:15","end":"17:00","item":"Wrap, strike, load out","who":"Ruilin, Darek","notes":""}]}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'callsheet_bhn_promo_2026_10_06'
  AND "data"->'people' @> '[{"name": "Darek Zdzienicki", "call": "08:00"}]'::jsonb;

-- 2. If it had been edited, the two changes alone, leaving the rest as it is.
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
          CASE WHEN r->>'item' LIKE 'Crew call%' THEN r || jsonb_build_object('time', '10:30', 'end', '10:45') ELSE r END ORDER BY ord)
        FROM jsonb_array_elements("data"->'schedule') WITH ORDINALITY AS t(r, ord)
      )),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'callsheet_bhn_promo_2026_10_06'
  AND jsonb_typeof("data"->'people') = 'array'
  AND jsonb_typeof("data"->'schedule') = 'array';

UPDATE "FilmingPerson" SET "role" = 'Producer & DP — set-up, camera, lab shots' WHERE "id" = 'fp_ruilin' AND "role" ILIKE '%director%';
