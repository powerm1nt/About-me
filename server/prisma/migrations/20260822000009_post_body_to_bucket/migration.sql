-- Post and page bodies move from a column to an object in the data bucket, so that the bucket's own
-- versioning becomes the edit history and a user's writing stays a file they can fetch.

ALTER TABLE "post" ADD COLUMN "bodyPath" TEXT;
ALTER TABLE "profile_page" ADD COLUMN "bodyPath" TEXT;

-- "body" is deliberately NOT dropped here, only made optional.
--
-- This migration runs against a database this change was written without being able to read: the
-- instance is private to the VPC. Dropping a column that might hold the only copy of somebody's
-- writing, to save one nullable column, is not a trade worth making. Drop it in a later migration
-- once `SELECT count(*) FROM post WHERE body IS NOT NULL AND "bodyPath" IS NULL` returns zero
-- everywhere it matters.
ALTER TABLE "post" ALTER COLUMN "body" DROP NOT NULL;
ALTER TABLE "profile_page" ALTER COLUMN "body" DROP NOT NULL;
