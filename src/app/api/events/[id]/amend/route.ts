import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface AmendBody {
  reason: string;
  signedBy: string;
  pin: string;
}

// Corrections are new linked rows, never edits — mirrors the paper
// amendment procedure (struck-through row, circled initials).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as AmendBody;

  if (!body.reason || !body.signedBy || !body.pin) {
    return NextResponse.json({ error: "Missing reason, signedBy, or pin." }, { status: 400 });
  }

  const medic = await query<{ id: string }>(
    `SELECT id FROM medics WHERE id = $1 AND pin = $2 AND active`,
    [body.signedBy, body.pin]
  );
  if (medic.rows.length === 0) {
    return NextResponse.json({ error: "PIN doesn't match an active medic." }, { status: 422 });
  }

  const event = await query(`SELECT id FROM events WHERE id = $1`, [id]);
  if (event.rows.length === 0) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const inserted = await query<{ id: number }>(
    `INSERT INTO amendments (event_id, reason, signed_by) VALUES ($1, $2, $3) RETURNING id`,
    [id, body.reason, body.signedBy]
  );

  return NextResponse.json({ id: inserted.rows[0].id }, { status: 201 });
}
