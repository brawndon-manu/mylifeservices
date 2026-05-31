-- drop the client caseload table. caseloads are being relocated to the
-- separate, compliant behavioral data app; the portal holds no client
-- data. drops the Client table (and its FK to User + index with it).
DROP TABLE "Client";
