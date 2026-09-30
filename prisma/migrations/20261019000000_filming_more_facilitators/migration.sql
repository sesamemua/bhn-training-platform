-- Facilitators for the BHN Promo interviews that had none: Roshni for the
-- three student interviews, Yoo Jin and Yeseul for Roshni, Yoo Jin and
-- Epshita for Molly. Only where nobody has been put on them since.
UPDATE "FilmingBlock" SET "facilitators" = ARRAY['fp_roshni'], "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('fb_student1', 'fb_student2', 'fb_student3') AND cardinality("facilitators") = 0;
UPDATE "FilmingBlock" SET "facilitators" = ARRAY['fp_yoojin', 'fp_yeseul'], "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'fb_roshni' AND cardinality("facilitators") = 0;
UPDATE "FilmingBlock" SET "facilitators" = ARRAY['fp_yoojin', 'fp_epshita'], "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'fb_molly' AND cardinality("facilitators") = 0;
