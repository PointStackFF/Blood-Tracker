import { NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { dinKey } from "@/lib/isbt";
import { toConsignment, type ConsignmentRowDb } from "@/lib/rows";

export async function GET() {
  const { rows } = await query<ConsignmentRowDb>(
    `SELECT * FROM consignments ORDER BY issued_at DESC`
  );
  return NextResponse.json(rows.map(toConsignment));
}

interface UnitInput {
  id: string;
  unitNumber: string;
  facility: string;
  collectionYear: string;
  serial: string;
  productCode: string;
  aboRh: string;
  expires: string;
}

interface CreateBody {
  id: string;
  location: string;
  bloodBankRef?: string;
  issuedBy: string;
  issuedAt: string;
  medicId: string;
  units: UnitInput[];
  stockMovedInWellsky?: boolean;
  uncrossmatchedStickerAffixed?: boolean;
}

// Issues a new consignment: writes the consignment, its units, and one
// ISSUE event per unit sharing a batch_id — mirrors the blood bank filling
// in the top of the paper form and handing over the pack.
export async function POST(req: Request) {
  const body = (await req.json()) as CreateBody;

  if (!body.id || !body.location || !body.issuedBy || !body.issuedAt || !body.units?.length) {
    return NextResponse.json({ error: "Missing required consignment fields." }, { status: 400 });
  }

  const batchId = `issue-${body.id}`;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO consignments
         (id, location, blood_bank_ref, issued_by, issued_at, stock_moved_in_wellsky, uncrossmatched_sticker_affixed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        body.id,
        body.location,
        body.bloodBankRef ?? null,
        body.issuedBy,
        body.issuedAt,
        body.stockMovedInWellsky ?? false,
        body.uncrossmatchedStickerAffixed ?? false,
      ]
    );

    for (const u of body.units) {
      await client.query(
        `INSERT INTO units
           (id, consignment_id, unit_number, din_key, facility, collection_year, serial, product_code, abo_rh, expires)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          u.id,
          body.id,
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
          body.issuedAt,
          body.medicId,
          batchId,
          JSON.stringify({ note: "Released from blood bank" }),
        ]
      );
    }
  });

  return NextResponse.json({ id: body.id, batchId }, { status: 201 });
}
