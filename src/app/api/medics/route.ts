import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// PIN is intentionally never returned — see CLAUDE.md on why it's not real auth.
export async function GET() {
  const { rows } = await query<{ id: string; name: string; active: boolean }>(
    `SELECT id, name, active FROM medics ORDER BY name`
  );
  return NextResponse.json(rows);
}

interface CreateBody {
  id: string;
  name: string;
  pin: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreateBody;
  if (!body.id || !body.name || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: "id, name, and a 4-digit pin are required." }, { status: 400 });
  }

  await query(`INSERT INTO medics (id, name, pin) VALUES ($1, $2, $3)`, [
    body.id,
    body.name,
    body.pin,
  ]);

  return NextResponse.json({ id: body.id }, { status: 201 });
}
