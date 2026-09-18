-- Video Production clean-up.

-- 1. The 2026 Symposium comms plan and sponsorship package are documents,
--    not videos. They have their own Workspace tabs; take them out of the
--    Video Production list (which shows category 'marketing' only).
UPDATE "VideoProject" SET "category" = 'symposium', "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = '2026 Annual Symposium & Training Week' AND "category" = 'marketing';

-- 2. "Molly Interview Conversation Guide" under the BHN Promo project was a
--    second, untouched copy the seeder made after the real guide was
--    renamed. Archive it (reversible) — only while it has no history,
--    comments or share links, and only if the real guide is still there.
UPDATE "Script" s SET "isArchived" = true, "updatedAt" = CURRENT_TIMESTAMP
FROM "VideoProject" p
WHERE s."projectId" = p."id"
  AND p."title" = 'BHN Promo Video Project'
  AND s."title" = 'Molly Interview Conversation Guide'
  AND s."isArchived" = false
  AND NOT EXISTS (SELECT 1 FROM "ScriptRevision" r WHERE r."scriptId" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "ScriptComment" c WHERE c."scriptId" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "ScriptShareToken" t WHERE t."scriptId" = s."id")
  AND EXISTS (SELECT 1 FROM "Script" o WHERE o."projectId" = p."id" AND o."title" = 'BHN Promo Video Scripts' AND o."isArchived" = false);

-- 3. The real guide is the BHN Promo Video document.
UPDATE "Script" s SET "title" = 'BHN Promo Video', "updatedAt" = CURRENT_TIMESTAMP
FROM "VideoProject" p
WHERE s."projectId" = p."id" AND p."title" = 'BHN Promo Video Project' AND s."title" = 'BHN Promo Video Scripts';

-- 4. The BHN Promo shoot-day call sheet, revised: Ruilin produces and
--    directs, Darek is sound & lighting, pillar leads shoot after Molly,
--    Yoo Jin on the pillars, wrap by 17:00, and no contract / rental detail.
--    Only if nobody has edited the sheet since it was seeded.
UPDATE "CallSheet"
SET "data" = '{"production":"BHN Promo Video — homepage, pillar and Symposium videos","dayLabel":"Day 1 of 1","generalCall":"08:00","wrap":"17:00","locationName":"U of T St. George campus — lab and interview room TBC","locationAddress":"Toronto, ON","locationNotes":"Interviews in one room; lab B-roll with students. Confirm the rooms, power and access with the lab before Friday 2 Oct.","parking":"Landmark Garage, 35 Hart House Circle (under King''s College Circle). Enter from Wellesley St. West only. Two spots: Ruilin''s car and Darek''s truck.","meals":"Coffee on arrival (Tim Hortons). Lunch at 12:15 for 10.","hospital":"Toronto General Hospital — Emergency, 200 Elizabeth St. In an emergency call 911.","weather":"Check the forecast on Monday 5 Oct.","equipment":"","notes":"Everyone on camera signs a filming release before they are filmed.\nThree pieces are shot today: the BHN homepage video (the Scientific Directors on the initiative, Yoo Jin on the three pillars), the pillar videos (ENGAGE, EXPERIENCE, EQUIP), and Symposium content — each pillar lead''s highlights of the year and the Scientific Directors'' Year in Review lines.\nScripts and prompts: Workspace → Video Production → BHN Promo Video.","people":[{"name":"Molly","role":"Scientific Director — homepage video lead voice; Year in Review","group":"talent","call":"09:15","phone":"","email":"","notes":"09:30–11:00: interview, Year in Review lines, lab B-roll"},{"name":"Epshita Islam","role":"ENGAGE pillar lead — pillar video; year highlights","group":"talent","call":"10:45","phone":"","email":"","notes":"11:00–11:25"},{"name":"Yeseul Lee","role":"EXPERIENCE pillar lead — pillar video; year highlights","group":"talent","call":"11:10","phone":"","email":"","notes":"11:25–11:50"},{"name":"Roshni","role":"EQUIP pillar lead — pillar video; year highlights","group":"talent","call":"11:35","phone":"","email":"","notes":"11:50–12:15"},{"name":"Gilbert","role":"Scientific Director — homepage video; Year in Review","group":"talent","call":"12:45","phone":"","email":"","notes":"13:00–13:30"},{"name":"Darius","role":"Scientific Director — homepage video; Year in Review","group":"talent","call":"13:15","phone":"","email":"","notes":"13:30–14:00"},{"name":"Yoo Jin","role":"Homepage video — the three pillars","group":"talent","call":"13:45","phone":"","email":"","notes":"14:00–14:30"},{"name":"Ruilin Yuan","role":"Producer & Director — BHN Marketing & Communications","group":"crew","call":"07:30","phone":"","email":"ruilin.yuan@utoronto.ca","notes":"Parking, coffee, releases"},{"name":"Darek Zdzienicki","role":"Sound & lighting — CamArt Productions","group":"crew","call":"08:00","phone":"","email":"","notes":"Truck parks at Landmark Garage"},{"name":"Alison","role":"BHN team","group":"team","call":"12:15","phone":"","email":"","notes":"Lunch"}],"schedule":[{"time":"07:30","end":"08:00","item":"Producer on site — parking, coffee, releases","who":"Ruilin","notes":""},{"time":"08:00","end":"08:15","item":"Crew call — load in from Landmark Garage","who":"Darek","notes":""},{"time":"08:15","end":"09:30","item":"Set lights, sound and camera; test shots","who":"Ruilin, Darek","notes":""},{"time":"09:30","end":"10:15","item":"Molly — homepage video interview","who":"Molly","notes":"Guide → Molly tab"},{"time":"10:15","end":"10:40","item":"Molly — Year in Review lines","who":"Molly","notes":"Guide → Year in Review tab"},{"time":"10:40","end":"11:00","item":"Molly — B-roll in the lab with students","who":"Molly, students","notes":""},{"time":"11:00","end":"11:25","item":"ENGAGE — pillar video + year highlights","who":"Epshita","notes":"Guide → Pillar leads → ENGAGE"},{"time":"11:25","end":"11:50","item":"EXPERIENCE — pillar video + year highlights","who":"Yeseul","notes":"Guide → Pillar leads → EXPERIENCE"},{"time":"11:50","end":"12:15","item":"EQUIP — pillar video + year highlights","who":"Roshni","notes":"Guide → Pillar leads → EQUIP"},{"time":"12:15","end":"13:00","item":"Lunch","who":"All (10)","notes":""},{"time":"13:00","end":"13:30","item":"Gilbert — homepage video + Year in Review lines","who":"Gilbert","notes":""},{"time":"13:30","end":"14:00","item":"Darius — homepage video + Year in Review lines","who":"Darius","notes":""},{"time":"14:00","end":"14:30","item":"Yoo Jin — homepage video: the three pillars","who":"Yoo Jin","notes":"Guide → Yoo Jin tab"},{"time":"14:30","end":"16:15","item":"B-roll — lab, corridors, exteriors; pickups","who":"Ruilin, Darek","notes":""},{"time":"16:15","end":"17:00","item":"Wrap, strike, load out","who":"Ruilin, Darek","notes":""}]}'::jsonb,
    "title" = 'BHN Promo Video — Shoot day',
    "shootDate" = DATE '2026-10-06',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'callsheet_bhn_promo_2026_10_06' AND "updatedAt" = "createdAt";
