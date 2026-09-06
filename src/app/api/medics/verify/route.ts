import { NextResponse } from "next/server";
import { query } from "@/lib/db";

interface VerifyBody {
  id?: string;
  pin: string;
  role?: string;
}

// Backs the PIN pad's "sign and log" step — one tap, no session. The medic
// only types 4 digits (no separate id entry), so a bare pin resolves whoever
// it belongs to; passing id as well double-checks it's that specific medic.
// Passing role gates entry to a role-restricted flow (e.g. the biweekly
// restock) — a real medic's PIN is still "recognized" but rejected with a
// distinct message, not lumped in with a wrong PIN.
export async function POST(req: Request) {
  const body = (await req.json()) as VerifyBody;
  if (!body.pin) {
    return NextResponse.json({ ok: false, error: "Missing pin." }, { status: 400 });
  }

  const { rows } = body.id
    ? await query<{ id: string; name: string; role: string }>(
        `SELECT id, name, role FROM medics WHERE id = $1 AND pin = $2 AND active`,
        [body.id, body.pin]
      )
    : await query<{ id: string; name: string; role: string }>(
        `SELECT id, name, role FROM medics WHERE pin = $1 AND active LIMIT 1`,
        [body.pin]
      );

  if (rows.length === 0) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (body.role && rows[0].role !== body.role) {
    return NextResponse.json(
      { ok: false, error: `This needs a ${body.role}'s PIN.` },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, medic: { id: rows[0].id, name: rows[0].name } });
}
