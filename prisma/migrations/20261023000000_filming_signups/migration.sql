-- Trainees who sign up through the filming day's public link: whether they need a parking spot, and when they signed up.
ALTER TABLE "FilmingPerson" ADD COLUMN "parking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FilmingPerson" ADD COLUMN "signedUpAt" TIMESTAMP(3);
