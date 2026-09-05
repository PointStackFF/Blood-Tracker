-- Prehospital blood custody tracker — event log schema.
--
-- Current state is derived by replaying events; it is never stored.
-- events and amendments are append-only (enforced by trigger below) —
-- corrections are new linked rows, mirroring the paper amendment
-- procedure (struck-through row, circled initials).

CREATE TABLE IF NOT EXISTS consignments (
  id                              TEXT PRIMARY KEY,   -- e.g. 'C-17247-22' (paper form reference)
  location                        TEXT NOT NULL CHECK (location IN ('MacArthur Airport', 'Gabreski Airport')),
  blood_bank_ref                  TEXT,               -- paper form "Reference #", if distinct from id
  issued_by                       TEXT NOT NULL,       -- Blood Bank Transfer box: Technologist
  issued_at                       TIMESTAMPTZ NOT NULL,-- Blood Bank Transfer box: Date + Time
  stock_moved_in_wellsky          BOOLEAN NOT NULL DEFAULT false,
  uncrossmatched_sticker_affixed  BOOLEAN NOT NULL DEFAULT false,
  qa_reviewed_by                  TEXT,                -- QA Review box, filled in after the fact
  qa_reviewed_at                  TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id              TEXT PRIMARY KEY,         -- e.g. 'UA'
  consignment_id  TEXT NOT NULL REFERENCES consignments(id),
  unit_number     TEXT NOT NULL,            -- as printed, e.g. 'W1833 26 337371 8'
  din_key         TEXT NOT NULL UNIQUE,     -- facility+year+serial from isbt.js; flags excluded on purpose
  facility        TEXT NOT NULL,
  collection_year TEXT NOT NULL,
  serial          TEXT NOT NULL,
  product_code    TEXT NOT NULL,
  abo_rh          TEXT NOT NULL,
  expires         TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS units_consignment_id_idx ON units (consignment_id);

-- 4-digit PIN signing. Not real security — it demos the signed-entry
-- concept in one tap. Swap for real auth later (see CLAUDE.md).
CREATE TABLE IF NOT EXISTS medics (
  id         TEXT PRIMARY KEY,              -- e.g. '4417'
  name       TEXT NOT NULL,
  pin        TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id               BIGSERIAL PRIMARY KEY,
  unit_id          TEXT NOT NULL REFERENCES units(id),
  type             TEXT NOT NULL CHECK (type IN (
                     'ISSUE', 'REM', 'TIC_SWAP', 'RET', 'QUARANTINE',
                     'TRANSFUSE', 'DISCARD', 'RETURN_BB', 'FLAG'
                   )),
  at               TIMESTAMPTZ NOT NULL,    -- device-reported event time
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(), -- server insert time
  captured_offline BOOLEAN NOT NULL DEFAULT false,
  medic_id         TEXT NOT NULL REFERENCES medics(id),
  batch_id         TEXT,                    -- ties together a pack-level action across units; convenience only
  detail           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_unit_id_at_idx ON events (unit_id, at);
CREATE INDEX IF NOT EXISTS events_batch_id_idx ON events (batch_id) WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS amendments (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT NOT NULL REFERENCES events(id),
  reason     TEXT NOT NULL,
  signed_by  TEXT NOT NULL REFERENCES medics(id),
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS amendments_event_id_idx ON amendments (event_id);

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_no_update_delete ON events;
CREATE TRIGGER events_no_update_delete
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS amendments_no_update_delete ON amendments;
CREATE TRIGGER amendments_no_update_delete
  BEFORE UPDATE OR DELETE ON amendments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
