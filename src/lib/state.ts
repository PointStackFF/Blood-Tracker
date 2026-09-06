/* ------------------------------------------------------------------ *
 * State is derived by replaying a unit's events — never stored.
 *
 *   IN_FRIDGE ⇄ IN_COOLER
 *       │           │
 *       │           ├─→ TRANSFUSED  (terminal)
 *       │           ├─→ DISCARDED   (terminal)
 *       │           └─→ RETURNED_BB (terminal) — handed to a blood bank
 *       │                            straight from the cooler, e.g. a
 *       │                            leftover unit swapped out at a hospital
 *       ├─→ RETURNED_BB (terminal)
 *       └─→ QUARANTINE ─→ DISCARDED
 *
 * Pull one unit's events out of the log and the record must read
 * completely on its own, with no reference to the other unit in the pair.
 * ------------------------------------------------------------------ */

export type EventType =
  | "ISSUE"
  | "REM"
  | "TIC_SWAP"
  | "RET"
  | "QUARANTINE"
  | "TRANSFUSE"
  | "DISCARD"
  | "RETURN_BB"
  | "FLAG";

export type UnitState =
  | "IN_FRIDGE"
  | "IN_COOLER"
  | "QUARANTINE"
  | "TRANSFUSED"
  | "DISCARDED"
  | "RETURNED_BB";

export const TERMINAL: UnitState[] = ["TRANSFUSED", "DISCARDED", "RETURNED_BB"];

export interface EventDetail {
  visual?: "pass" | "fail";
  ticNo?: string;
  cooler?: string;
  tic?: "pass" | "fail";
  fromTic?: string;
  toTic?: string;
  swaps?: { from: string; to: string }[];
  mrn?: string;
  mrnPending?: boolean;
  incident?: string;
  reason?: string;
  note?: string;
}

export interface EventRow {
  id: number;
  unitId: string;
  type: EventType;
  at: string; // ISO timestamp
  medicId: string;
  batchId: string | null;
  detail: EventDetail;
  capturedOffline: boolean;
}

export interface UnitSnapshot {
  state: UnitState;
  cooler: string | null;
  ticNo: string | null;
  since: string | null;
  manualFlag: boolean;
  isOpen: boolean;
}

/** Replays one unit's events (already sorted by `at`) into its current snapshot. */
export function replay(events: EventRow[]): UnitSnapshot {
  let state: UnitState = "IN_FRIDGE";
  let cooler: string | null = null;
  let ticNo: string | null = null;
  let since: string | null = events[0]?.at ?? null;
  let manualFlag = false;

  for (const e of events) {
    switch (e.type) {
      case "ISSUE":
        since = e.at;
        break;
      case "REM":
        state = "IN_COOLER";
        cooler = e.detail.cooler ?? null;
        ticNo = e.detail.ticNo ?? null;
        since = e.at;
        break;
      case "TIC_SWAP":
        ticNo = e.detail.toTic ?? ticNo;
        break;
      case "RET":
        state = "IN_FRIDGE";
        cooler = null;
        ticNo = null;
        since = e.at;
        break;
      case "QUARANTINE":
        state = "QUARANTINE";
        since = e.at;
        break;
      case "TRANSFUSE":
        state = "TRANSFUSED";
        since = e.at;
        break;
      case "DISCARD":
        state = "DISCARDED";
        since = e.at;
        break;
      case "RETURN_BB":
        state = "RETURNED_BB";
        since = e.at;
        break;
      case "FLAG":
        manualFlag = true;
        break;
    }
  }

  return {
    state,
    cooler,
    ticNo,
    since,
    manualFlag,
    isOpen: !TERMINAL.includes(state),
  };
}

/** What event types are legal to log next, given the unit's current state. */
export function legalActions(state: UnitState): EventType[] {
  switch (state) {
    case "IN_FRIDGE":
      return ["REM", "RETURN_BB", "QUARANTINE", "FLAG"];
    case "IN_COOLER":
      return ["RET", "TIC_SWAP", "TRANSFUSE", "DISCARD", "RETURN_BB", "QUARANTINE", "FLAG"];
    case "QUARANTINE":
      return ["DISCARD", "FLAG"];
    default:
      return []; // terminal states accept nothing further
  }
}

export class IllegalEventError extends Error {}

/**
 * Validates a proposed event against the unit's current snapshot and the
 * forcing functions from CLAUDE.md. Throws IllegalEventError with a message
 * written for the person holding the bag, not for a log.
 */
export function validateEvent(snapshot: UnitSnapshot, type: EventType, detail: EventDetail): void {
  if (!legalActions(snapshot.state).includes(type)) {
    throw new IllegalEventError(
      `Can't log ${type} — unit is currently ${snapshot.state}.`
    );
  }

  switch (type) {
    case "REM":
      if (detail.visual !== "pass") {
        throw new IllegalEventError("Visual inspection must pass to remove a unit — log QUARANTINE instead.");
      }
      if (!detail.ticNo) throw new IllegalEventError("REM requires a TIC number.");
      if (!detail.cooler) throw new IllegalEventError("REM requires a cooler number.");
      if (detail.tic !== "pass") throw new IllegalEventError("REM requires a passing TIC check.");
      break;
    case "RET":
      if (detail.tic !== "pass") throw new IllegalEventError("RET requires a passing TIC check.");
      break;
    case "TIC_SWAP":
      if (!detail.fromTic || !detail.toTic) {
        throw new IllegalEventError("TIC_SWAP requires both the outgoing and incoming TIC numbers.");
      }
      if (detail.tic !== "pass") {
        throw new IllegalEventError("The replacement TIC must pass its check before the swap is logged.");
      }
      break;
    case "QUARANTINE":
      if (!detail.reason) throw new IllegalEventError("QUARANTINE requires a reason.");
      break;
    case "TRANSFUSE":
      if (!detail.mrn && !(detail.mrnPending && detail.incident)) {
        throw new IllegalEventError("TRANSFUSE requires an MRN, or an incident number with MRN pending.");
      }
      break;
    case "DISCARD":
      if (!detail.reason) throw new IllegalEventError("DISCARD requires a reason.");
      break;
    case "FLAG":
      if (!detail.reason) throw new IllegalEventError("FLAG requires a note on what looks wrong.");
      break;
  }
}
