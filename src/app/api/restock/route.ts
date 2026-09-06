import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { dinKey } from "@/lib/isbt";
import { toEventRow, type EventRowDb } from "@/lib/rows";
import { IllegalEventError, replay, validateEvent } from "@/lib/state";

interface NewUnitInput {
  id: string;
  unitNumber: string;
  facility: string;
  collectionYear: string;
  serial: string;
  productCode: string;
  aboRh: string;
  expires: string;
}

interface NewConsignmentInput {
  id: string;
  location: string;
  bloodBankRef?: string;
  issuedBy: string;
  issuedAt: string;
  units: NewUnitInput[];
}

interface RestockBody {
  oldUnitIds: string[];
  consignment: NewConsignmentInput;
  medicId: string;
  pin: string;
  at: string;
}

// The biweekly base restock: a supervisor pulls whatever's currently in a
// base's fridge (unused, going back to the hospital blood bank) and leaves
// a fresh consignment. Unlike the medic-driven hospital swap, this is one
// atomic transaction and the one place a role check matters — everything
// else in this app is any-signed-medic, but a restock needs a supervisor's
// PIN specifically.
export async function POST(req: Request) {
  const body = (await req.json()) as RestockBody;

  if (!body.medicId || !body.pin || !body.at || !body.consignment?.units?.length) {
    return NextResponse.json({ error: "Missing required restock fields." }, { status: 400 });
  }

  try {
    await withTransaction(async (client) => {
      const medic = await client.query<{ id: string; active: boolean; role: string }>(
        `SELECT id, active, role FROM medics WHERE id = $1 AND pin = $2`,
        [body.medicId, body.pin]
      );
      if (medic.rows.length === 0) {
        throw new IllegalEventError("PIN doesn't match that medic.");
      }
      if (!medic.rows[0].active) {
        throw new IllegalEventError("That medic's signing PIN is no longer active.");
      }
      if (medic.rows[0].role !== "supervisor") {
        throw new IllegalEventError("This needs a supervisor's PIN.");
      }

      for (const unitId of body.oldUnitIds ?? []) {
        const existing = await client.query<EventRowDb>(
          `SELECT * FROM events WHERE unit_id = $1 ORDER BY at, id`,
          [unitId]
        );
        if (existing.rows.length === 0) {
          throw new IllegalEventError(`Unit ${unitId} has no ISSUE event yet.`);
        }
        const snapshot = replay(existing.rows.map(toEventRow));
        validateEvent(snapshot, "RETURN_BB", {});

        await client.query(
          `INSERT INTO events (unit_id, type, at, medic_id, batch_id, detail)
           VALUES ($1, 'RETURN_BB', $2, $3, $4, $5)`,
          [
            unitId,
            body.at,
            body.medicId,
            `restock-${body.consignment.id}`,
            JSON.stringify({ note: "Removed during scheduled supervisor restock" }),
          ]
        );
      }

      const c = body.consignment;
      await client.query(
        `INSERT INTO consignments
           (id, location, blood_bank_ref, issued_by, issued_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [c.id, c.location, c.bloodBankRef ?? null, c.issuedBy, c.issuedAt]
      );

      for (const u of c.units) {
        await client.query(
          `INSERT INTO units
             (id, consignment_id, unit_number, din_key, facility, collection_year, serial, product_code, abo_rh, expires)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            u.id,
            c.id,
            u.unitNumber,
            dinKey(u.facility, u.collectionYear, u.serial),
            u.facility,
            u.collectionYear,
            u.serial,
            u.productCode,
            u.aboRh,
            u.expires,
          ]
        );

        await client.query(
          `INSERT INTO events (unit_id, type, at, medic_id, batch_id, detail)
           VALUES ($1, 'ISSUE', $2, $3, $4, $5)`,
          [
            u.id,
            c.issuedAt,
            body.medicId,
            `restock-${c.id}`,
            JSON.stringify({ note: "Released from blood bank during scheduled base restock" }),
          ]
        );
      }
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof IllegalEventError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
