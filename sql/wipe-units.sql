-- TEST-DATA RESET ONLY. Clears every unit and its custody chain so the base can
-- be restocked fresh. Keeps medics (PINs/roles).
-- Uses TRUNCATE because the append-only row triggers on events/amendments
-- (correctly) reject DELETE; TRUNCATE is statement-level and is the one
-- sanctioned way to reset a test database. Never run against real records.
TRUNCATE amendments, events, units, consignments RESTART IDENTITY CASCADE;
