import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { replay } from "@/lib/state";
import { toEventRow, toUnit, type EventRowDb, type UnitRowDb } from "@/lib/rows";

// Every unit, joined with its derived state — the blood bank dashboard's
// core query. State is computed here, never stored.
export async function GET() {
  const units = await query<UnitRowDb>(`SELECT * FROM units ORDER BY id`);
  const events = await query<EventRowDb>(
    `SELECT * FROM events ORDER BY unit_id, at, id`
  );

  const eventsByUnit = new Map<string, EventRowDb[]>();
  for (const e of events.rows) {
    const list = eventsByUnit.get(e.unit_id) ?? [];
    list.push(e);
    eventsByUnit.set(e.unit_id, list);
  }

  const result = units.rows.map((u) => {
    const unitEvents = (eventsByUnit.get(u.id) ?? []).map(toEventRow);
    return {
      unit: toUnit(u),
      snapshot: replay(unitEvents),
      eventCount: unitEvents.length,
    };
  });

  return NextResponse.json(result);
}
