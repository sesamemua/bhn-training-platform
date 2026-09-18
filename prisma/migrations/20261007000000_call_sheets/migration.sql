-- Call sheets for Workspace → Video Production.
--
-- One row per shoot day. Title and date are columns so the list sorts;
-- everything else is one JSON document, validated in the app on write.
CREATE TABLE "CallSheet" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shootDate" DATE,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSheet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CallSheet_shootDate_idx" ON "CallSheet"("shootDate");

-- The BHN Promo Video shoot day, prebuilt from what is already on file
-- (src/lib/video/call-sheet.ts → BHN_PROMO_CALL_SHEET). Seeded here, once,
-- rather than on page render; after this it is the team's to edit.
INSERT INTO "CallSheet" ("id", "title", "shootDate", "data", "updatedAt")
VALUES (
    'callsheet_bhn_promo_2026_10_06',
    'BHN Promo Video — Shoot day',
    DATE '2026-10-06',
    '{"production":"BHN Promo Video — BioHubNet Scientific Directors","dayLabel":"Day 2 of 3 · shoot day (Mon 5 pickup · Wed 7 return)","generalCall":"08:00","wrap":"16:00","locationName":"U of T St. George campus — lab and interview room TBC","locationAddress":"Toronto, ON","locationNotes":"Molly''s interview, then B-roll with students in the lab. Confirm the room, power and access with the lab before Friday 2 Oct.","parking":"Landmark Garage, 35 Hart House Circle (under King''s College Circle). Enter from Wellesley St. West only. $22 day maximum. Two spots: Ruilin''s car and the lighting / sound technician''s truck (confirmed to fit the 2.4 m clearance).","meals":"Coffee on arrival: 2 Tim Hortons coffee boxes. Lunch at 12:00 for 10 — U of T lunch allowance, $25 a person.","hospital":"Toronto General Hospital — Emergency, 200 Elizabeth St. In an emergency call 911.","weather":"Check the forecast on Monday 5 Oct.","equipment":"Camera: 2D House, quote 263434 (ARRI Alexa Mini LF package) — pick up Mon 5 Oct after 12:00, return Wed 7 Oct before 12:00. Payment due on pickup.\nLens: William White — Caldwell Chameleon 75 mm anamorphic, full frame.\nSound & lighting: CamArt Productions, quote 1237 — sound kit, 8 ft softbox, 6×6 frame, Aputure 600x if needed.\nInsurance certificate to both rental houses before pickup.","notes":"Everyone on camera signs a filming release before they are filmed.\nMolly leads; Gilbert and Darius have shorter, focused segments — see the interview guide under Projects.\nCapture the optional 2026 Symposium pickup line with Molly if time allows.","people":[{"name":"Ruilin Yuan","role":"Producer — Marketing & Communications Officer, BHN","group":"team","call":"07:30","phone":"","email":"ruilin.yuan@utoronto.ca","notes":"Parking, coffee, releases"},{"name":"Darek Zdzienicki","role":"Director of Photography — CamArt Productions","group":"crew","call":"08:00","phone":"","email":"","notes":""},{"name":"Lighting / sound technician","role":"Sound mixer + lighting — CamArt Productions","group":"crew","call":"08:00","phone":"","email":"","notes":"Name TBC. Truck parks at Landmark Garage."},{"name":"Molly","role":"Scientific Director — lead voice","group":"talent","call":"09:15","phone":"","email":"","notes":"1.5 h: interview + lab B-roll"},{"name":"Gilbert","role":"Scientific Director — industry & translation","group":"talent","call":"10:45","phone":"","email":"","notes":"30 min"},{"name":"Darius","role":"Scientific Director — innovation & future science","group":"talent","call":"11:15","phone":"","email":"","notes":"30 min"},{"name":"Epshita Islam","role":"ENGAGE pillar lead","group":"team","call":"12:00","phone":"","email":"","notes":"Lunch; pickups TBC"},{"name":"Yeseul Lee","role":"EXPERIENCE pillar lead","group":"team","call":"12:00","phone":"","email":"","notes":"Lunch; pickups TBC"},{"name":"Roshni","role":"EQUIP pillar lead","group":"team","call":"12:00","phone":"","email":"","notes":"Lunch; pickups TBC"},{"name":"Yoo Jin","role":"BHN team","group":"team","call":"12:00","phone":"","email":"","notes":""},{"name":"Alison","role":"BHN team","group":"team","call":"12:00","phone":"","email":"","notes":""},{"name":"Vickie Sprenger","role":"2D House — camera rental","group":"vendor","call":"","phone":"(416) 800-2193 ext. 201","email":"vickie@2dhouse.com","notes":"230 New Toronto St, Unit 1"},{"name":"William White","role":"Lens rental — Caldwell Chameleon 75 mm","group":"vendor","call":"","phone":"","email":"","notes":"Contact TBC"}],"schedule":[{"time":"07:30","end":"08:00","item":"Producer on site — parking, coffee, releases","who":"Ruilin","notes":""},{"time":"08:00","end":"08:15","item":"Crew call — load in from Landmark Garage","who":"Darek, technician","notes":""},{"time":"08:15","end":"09:30","item":"Set lights, sound and camera; test shots","who":"Crew","notes":""},{"time":"09:30","end":"10:15","item":"Molly — interview (four prompts)","who":"Molly","notes":"Interview guide → Molly tab"},{"time":"10:15","end":"11:00","item":"Molly — B-roll in the lab with students","who":"Molly, students","notes":"Symposium pickup line if time allows"},{"time":"11:00","end":"11:30","item":"Gilbert — industry & translation","who":"Gilbert","notes":""},{"time":"11:30","end":"12:00","item":"Darius — innovation & future science","who":"Darius","notes":""},{"time":"12:00","end":"12:45","item":"Lunch","who":"All (10)","notes":""},{"time":"12:45","end":"14:30","item":"Pillar lead pickups / extra coverage (TBC)","who":"Epshita, Yeseul, Roshni","notes":""},{"time":"14:30","end":"15:30","item":"B-roll — lab, corridors, exteriors","who":"Crew","notes":""},{"time":"15:30","end":"16:00","item":"Wrap, strike, load out","who":"Crew","notes":""}]}'::jsonb,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
