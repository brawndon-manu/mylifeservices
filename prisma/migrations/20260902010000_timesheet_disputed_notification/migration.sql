-- THE BELL LEARNS ABOUT DISPUTES, 2026-09-02. notifyOversight has been asked
-- to write TIMESHEET_DISPUTED notifications since the corrections feature
-- shipped, and the enum never held the value - the insert threw and the catch
-- swallowed it, so the bell never rang for a reported timesheet problem.
--
-- Additive: one enum value, nothing dropped.

ALTER TYPE "NotificationType" ADD VALUE 'TIMESHEET_DISPUTED';
