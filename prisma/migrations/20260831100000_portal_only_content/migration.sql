-- Content only visible in the portal, 2026-08-31. Britny's CPR
-- re-certification wants a training link and a payment code that reach the
-- audience without ever sitting in an inbox. Additive: one nullable column.

ALTER TABLE "Announcement" ADD COLUMN "portalOnly" TEXT;
