import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { toEventRow, type EventRowDb } from "@/lib/rows";
import { IllegalEventError, replay, validateEvent, type EventDetail, type EventType } from "@/lib/state";

interface EntryInput {
  unitId: string;
  type: EventType;
  detail?: EventDetail;
}

interface PostBody {
  medicId: string;
  pin: string;
  at: string; // device-reported time
  capturedOffline?: boolean;
  batchId?: string;
  entries: EntryInput[];
}

// Appends one or more events in a single transaction, sharing a batch_id
// when a pack-level action (pack-out, pack-in) touches both units.
// The app infers legality from replayed history — it never trusts the client.
export async function POST(req: Request) {
  const body = (await req.json()) as PostBody;

  if (!body.medicId || !body.pin || !body.at || !body.entries?.length) {
    return NextResponse.json({ error: "Missing medicId, pin, at, or entries." }, { status: 400 });
  }

  const batchId = body.batchId ?? (body.entries.length > 1 ? `b-${Date.now()}` : null);

  try {
    const created = await withTransaction(async (client) => {
      const medic = await client.query<{ id: string; active: boolean }>(
        `SELECT id, active FROM medics WHERE id = $1 AND pin = $2`,
        [body.medicId, body.pin]
      );
      if (medic.rows.length === 0) {
        throw new IllegalEventError("PIN doesn't match that medic.");
      }
      if (!medic.rows[0].active) {
        throw new IllegalEventError("That medic's signing PIN is no longer active.");
      }

      const insertedIds: number[] = [];

      for (const entry of body.entries) {
        const existing = await client.query<EventRowDb>(
          `SELECT * FROM events WHERE unit_id = $1 ORDER BY at, id`,
          [entry.unitId]
        );
        if (existing.rows.length === 0) {
          throw new IllegalEventError(`Unit ${entry.unitId} has no ISSUE event yet.`);
        }

        const snapshot = replay(existing.rows.map(toEventRow));
        validateEvent(snapshot, entry.type, entry.detail ?? {});

        const inserted = await client.query<{ id: number }>(
          `INSERT INTO events (unit_id, type, at, medic_id, batch_id, detail, captured_offline)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            entry.unitId,
            entry.type,
            body.at,
            body.medicId,
            batchId,
            JSON.stringify(entry.detail ?? {}),
            body.capturedOffline ?? false,
          ]
        );
        insertedIds.push(inserted.rows[0].id);
      }

      return insertedIds;
    });

    return NextResponse.json({ batchId, eventIds: created }, { status: 201 });
  } catch (err) {
    if (err instanceof IllegalEventError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
