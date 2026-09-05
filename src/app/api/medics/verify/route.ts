import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface VerifyBody {
  id: string;
  pin: string;
}

// Backs the PIN pad's "sign and log" step — one tap, no session.
export async function POST(req: Request) {
  const body = (await req.json()) as VerifyBody;
  if (!body.id || !body.pin) {
    return NextResponse.json({ ok: false, error: "Missing id or pin." }, { status: 400 });
  }

  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM medics WHERE id = $1 AND pin = $2 AND active`,
    [body.id, body.pin]
  );

  if (rows.length === 0) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true, medic: rows[0] });
}
