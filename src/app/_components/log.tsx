"use client";

import type { EventDetail, EventRow, EventType } from "@/lib/state";
import { hhmm, mdy } from "./ui";

const TYPE_LABEL: Record<EventType, string> = {
  ISSUE: "Issued",
  REM: "Removed",
  TIC_SWAP: "TIC rotated",
  RET: "Returned to fridge",
  QUARANTINE: "Quarantined",
  TRANSFUSE: "Transfused",
  DISCARD: "Discarded",
  RETURN_BB: "Returned to blood bank",
  FLAG: "Flagged for review",
};

function detailBits(detail: EventDetail): string[] {
  const bits: string[] = [];
  if (detail.visual) bits.push(`Visual ${detail.visual}`);
  if (detail.ticNo) bits.push(`TIC ${detail.ticNo}`);
  if (detail.tic) bits.push(`TIC check ${detail.tic}`);
  if (detail.fromTic) bits.push(`TIC ${detail.fromTic} → ${detail.toTic}`);
  if (detail.swaps) bits.push(detail.swaps.map((s) => `TIC ${s.from} → ${s.to}`).join(", "));
  if (detail.cooler) bits.push(`Cooler ${detail.cooler}`);
  if (detail.mrn) bits.push(`MRN ${detail.mrn}`);
  if (detail.mrnPending) bits.push(`Incident ${detail.incident} · MRN pending`);
  if (detail.reason) bits.push(detail.reason);
  if (detail.note) bits.push(detail.note);
  return bits;
}

export interface LogRow {
  event: EventRow;
  unitLabel: string;
  medicName: string;
}

export function LogScreen({ rows, onBack }: { rows: LogRow[]; onBack: () => void }) {
  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        Back
      </button>
      <h2 className="mt-4 text-[24px] font-semibold tracking-tight">Custody log</h2>
      <p className="mt-1 text-[16px] text-zinc-600">
        Every entry, in order. Nothing here can be edited or deleted.
      </p>

      <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-zinc-300">
        <table className="w-full border-collapse bg-white text-left text-[14px]">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              {["#", "Unit", "Date", "Time", "Entry", "Details", "Signed", "Offline"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ event: e, unitLabel, medicName }) => {
              const d = new Date(e.at);
              const bits = detailBits(e.detail);
              return (
                <tr key={e.id} className="border-t border-zinc-200 align-top">
                  <td className="px-3 py-2.5 font-mono text-zinc-500">{e.id}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">{unitLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">{mdy(d)}</td>
                  <td className="px-3 py-2.5 font-mono">{hhmm(d)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">
                    {TYPE_LABEL[e.type]}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{bits.join(" · ") || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{medicName}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-500">
                    {e.capturedOffline ? "Yes" : ""}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
