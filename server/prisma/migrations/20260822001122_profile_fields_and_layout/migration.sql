-- Profile detail fields, and the visual layout editor's serialised output.

ALTER TABLE "profile"
  ADD COLUMN "profileLinks" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "publicEmail" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "pronouns" TEXT,
  -- Empty object rather than null: the profile renderer falls back to a default arrangement when
  -- nothing has been customised, and an absent key is easier to reason about than a null.
  ADD COLUMN "layout" JSONB NOT NULL DEFAULT '{}';
