-- A filming task can be ticked off on the day.
ALTER TABLE "FilmingBlock" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT false;
