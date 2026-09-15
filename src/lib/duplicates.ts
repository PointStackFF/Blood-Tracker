import type { PoolClient } from "pg";
import { dinKey } from "./isbt";
import { IllegalEventError } from "./state";

interface UnitLike {
  id: string;
  unitNumber: string;
  facility: string;
  collectionYear: string;
  serial: string;
}

// A unit number identifies one bag for the life of that bag, and the units
// table enforces it (units.din_key UNIQUE, units.id PRIMARY KEY). Hitting
// that constraint on the way in surfaces as a Postgres 23505, i.e. a 500
// with nothing a medic can act on. Check first and say which unit, and
// where it already lives, so the answer is "re-scan bag B", not "try again".
export async function assertUnitsAreNew(
  client: PoolClient,
  consignmentId: string,
  units: UnitLike[]
): Promise<void> {
  const consignment = await client.query(`SELECT id FROM consignments WHERE id = $1`, [
    consignmentId,
  ]);
  if (consignment.rows.length > 0) {
    throw new IllegalEventError(
      `Consignment ${consignmentId} is already on file. Reload the app and try again.`
    );
  }

  const keys = units.map((u) => dinKey(u.facility, u.collectionYear, u.serial));
  const dupeKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupeKeys.length > 0) {
    throw new IllegalEventError(
      "Both unit numbers scanned the same. Re-scan the second bag."
    );
  }

  const clash = await client.query<{
    unit_number: string;
    location: string;
    issued_at: Date;
  }>(
    `SELECT u.unit_number, c.location, c.issued_at
       FROM units u JOIN consignments c ON c.id = u.consignment_id
      WHERE u.din_key = ANY($1) OR u.id = ANY($2)`,
    [keys, units.map((u) => u.id)]
  );
  if (clash.rows.length > 0) {
    const r = clash.rows[0];
    const when = new Date(r.issued_at).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
    });
    throw new IllegalEventError(
      `Unit ${r.unit_number} is already on file — issued to ${r.location} on ${when}. Check the unit number on the bag.`
    );
  }
}

// Safety net for anything the pre-check can't see — a concurrent write, or
// a constraint added later. Postgres unique_violation.
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}
