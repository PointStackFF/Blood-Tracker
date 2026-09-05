import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { legalActions, replay } from "@/lib/state";
import { toEventRow, toUnit, type EventRowDb, type UnitRowDb } from "@/lib/rows";

// Pull one unit's events out of the log — the record must read completely
// on its own, with no reference to the other unit in its pair.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const unitResult = await query<UnitRowDb>(`SELECT * FROM units WHERE id = $1`, [id]);
  const unitRow = unitResult.rows[0];
  if (!unitRow) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const eventsResult = await query<EventRowDb>(
    `SELECT * FROM events WHERE unit_id = $1 ORDER BY at, id`,
    [id]
  );
  const events = eventsResult.rows.map(toEventRow);
  const snapshot = replay(events);

  return NextResponse.json({
    unit: toUnit(unitRow),
    snapshot,
    events,
    legalActions: legalActions(snapshot.state),
  });
}
