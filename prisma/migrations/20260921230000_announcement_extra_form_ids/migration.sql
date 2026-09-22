-- more forms to sign on the same announcement. formId stays the first one;
-- these are the rest, in order. empty on every post that exists today.
ALTER TABLE "Announcement" ADD COLUMN "extraFormIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
