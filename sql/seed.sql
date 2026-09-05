-- Demo consignment from CLAUDE.md's demo script:
-- two O Neg, product E0336, issued 8/25/26 0836 by K. Reagan, expiring 9/17/26.
-- Unit numbers/serials are invented for the prototype — never real MRNs or patient data.

INSERT INTO medics (id, name, pin) VALUES
  ('4417', 'K. Reagan', '4417'),
  ('2280', 'J. Marek', '2280')
ON CONFLICT (id) DO NOTHING;

INSERT INTO consignments
  (id, location, blood_bank_ref, issued_by, issued_at, stock_moved_in_wellsky, uncrossmatched_sticker_affixed)
VALUES
  ('C-17247-22', 'MacArthur Airport', '17247 2 2', 'K. Reagan', '2026-08-25T08:36:00-04:00', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO units (id, consignment_id, unit_number, din_key, facility, collection_year, serial, product_code, abo_rh, expires) VALUES
  ('UA', 'C-17247-22', 'W1833 26 313043 8', 'W183326313043', 'W1833', '26', '313043', 'E0336', 'O Neg', '2026-09-17T23:59:00-04:00'),
  ('UB', 'C-17247-22', 'W1833 26 337371 8', 'W183326337371', 'W1833', '26', '337371', 'E0336', 'O Neg', '2026-09-17T23:59:00-04:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (unit_id, type, at, medic_id, batch_id, detail) VALUES
  ('UA', 'ISSUE', '2026-08-25T08:36:00-04:00', '4417', 'b0', '{"note": "Released from blood bank, stock moved in WellSky"}'),
  ('UB', 'ISSUE', '2026-08-25T08:36:00-04:00', '4417', 'b0', '{"note": "Released from blood bank, stock moved in WellSky"}');
