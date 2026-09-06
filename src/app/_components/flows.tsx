"use client";

import { useState } from "react";
import { TERMINAL, type EventDetail, type EventType, type UnitSnapshot } from "@/lib/state";
import { parsePrintedUnitNumber, resolveScan, type Din } from "@/lib/isbt";
import { Scanner } from "./scanner";
import type { NewConsignmentInput, Unit } from "@/lib/client-api";
import { Button, Field, NumInput, PinPad, ScanRow, TicSwapPanel, Toggle, UnitTag, mdy, hhmm } from "./ui";

export interface Entry {
  unitId: string;
  type: EventType;
  detail: EventDetail;
}

export type Committer = (entries: Entry[], medic: { id: string; name: string }, pin: string, label: string) => void;

export type RestockCommitter = (
  oldUnitIds: string[],
  consignment: Omit<NewConsignmentInput, "medicId">,
  medic: { id: string; name: string },
  pin: string,
  label: string
) => void;

export type ConsignmentCommitter = (
  consignment: NewConsignmentInput,
  entries: Entry[],
  medic: { id: string; name: string },
  pin: string,
  label: string
) => void;

/* ------------------------------------------------------------------ *
 * Pack out — one flow, both units
 * ------------------------------------------------------------------ */

export function PackOut({
  units,
  now,
  onCommit,
  onBack,
}: {
  units: Unit[];
  now: number;
  onCommit: Committer;
  onBack: () => void;
}) {
  const [scanned, setScanned] = useState<string[]>([]);
  const [visual, setVisual] = useState<Record<string, "pass" | "fail">>({});
  const [ticNo, setTicNo] = useState("");
  const [tic, setTic] = useState<"pass" | "fail" | null>(null);
  const [toTic, setToTic] = useState("");
  const [swaps, setSwaps] = useState<{ from: string; to: string }[]>([]);
  const [cooler, setCooler] = useState("");
  const [signing, setSigning] = useState(false);

  const allScanned = units.every((u) => scanned.includes(u.id));
  const allInspected = units.every((u) => visual[u.id]);
  const passing = units.filter((u) => visual[u.id] === "pass");
  const failing = units.filter((u) => visual[u.id] === "fail");

  const doSwap = () => {
    setSwaps((s) => [...s, { from: ticNo, to: toTic.trim() }]);
    setTicNo(toTic.trim());
    setToTic("");
    setTic(null);
  };

  const ready =
    allScanned && allInspected && passing.length > 0 && ticNo.trim() && tic === "pass" && cooler.trim();

  const summary = `Pack ${passing.map((u) => u.id.slice(1)).join(" + ")} into TIC ${ticNo} · cooler ${cooler}`;

  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        Back
      </button>
      <h2 className="mt-4 text-[24px] font-semibold tracking-tight">Take the pack out</h2>
      <p className="mt-1 max-w-[42ch] text-[16px] leading-relaxed text-zinc-600">
        Both units travel together. Scan each bag as it goes in.
      </p>

      <Field label="Confirm the units" hint="Tap a row to scan it.">
        <div className="space-y-3">
          {units.map((u) => (
            <ScanRow
              key={u.id}
              unit={u}
              scanned={scanned.includes(u.id)}
              onScan={() =>
                setScanned((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))
              }
            />
          ))}
        </div>
      </Field>

      {allScanned && (
        <Field label="Visual inspection" hint="Each bag separately — clots, discoloration, leaks, damaged seal.">
          <div className="space-y-4">
            {units.map((u) => (
              <div key={u.id}>
                <div className="mb-1.5 text-[14px] text-zinc-600">
                  Unit {u.id.slice(1)} · <span className="font-mono">{u.unitNumber}</span>
                </div>
                <Toggle value={visual[u.id] ?? null} onChange={(v) => setVisual((s) => ({ ...s, [u.id]: v }))} />
              </div>
            ))}
          </div>
        </Field>
      )}

      {failing.length > 0 && (
        <div className="mt-4 rounded-xl bg-rose-50 p-4 text-[15px] leading-relaxed text-rose-900 ring-1 ring-rose-200">
          {failing.map((u) => `Unit ${u.id.slice(1)}`).join(" and ")}{" "}
          {failing.length > 1 ? "fail" : "fails"} inspection and won&apos;t go out.{" "}
          {passing.length > 0 ? "The rest of the pack can still travel." : "Nothing is going out — tell the blood bank."}
        </div>
      )}

      {allInspected && passing.length > 0 && (
        <>
          <Field label="TIC number" hint="The insert both units ride in.">
            <NumInput value={ticNo} onChange={(e) => setTicNo(e.target.value)} placeholder="4" />
          </Field>
          {ticNo.trim() && (
            <Field label={`Check TIC ${ticNo.trim()}`} hint="Seal, coolant, condition.">
              <Toggle value={tic} onChange={setTic} />
            </Field>
          )}
          {tic === "fail" && <TicSwapPanel fromTic={ticNo} toTic={toTic} setToTic={setToTic} onSwapped={doSwap} />}
          {tic === "pass" && (
            <Field label="Cooler number" hint="The soft cooler the insert sits in.">
              <NumInput value={cooler} onChange={(e) => setCooler(e.target.value)} placeholder="1" />
            </Field>
          )}
        </>
      )}

      {swaps.length > 0 && tic === "pass" && (
        <div className="mt-4 rounded-xl bg-zinc-100 p-4 text-[15px] leading-relaxed text-zinc-700">
          {swaps.map((s) => `TIC ${s.from} → ${s.to}`).join(", ")} logged on this entry.
        </div>
      )}

      <div className="mt-8">
        <Button onClick={() => setSigning(true)} disabled={!ready}>
          Sign and log
        </Button>
        <div className="mt-3 text-center text-[13px] text-zinc-500">
          Timestamped {mdy(new Date(now))} at {hhmm(new Date(now))}
        </div>
      </div>

      {signing && (
        <PinPad
          summary={summary}
          onCancel={() => setSigning(false)}
          onSigned={(medic, pin) => {
            setSigning(false);
            const entries: Entry[] = [
              ...passing.map((u) => ({
                unitId: u.id,
                type: "REM" as const,
                detail: {
                  visual: "pass" as const,
                  ticNo: ticNo.trim(),
                  cooler: cooler.trim(),
                  tic: "pass" as const,
                  ...(swaps.length ? { swaps } : {}),
                },
              })),
              ...failing.map((u) => ({
                unitId: u.id,
                type: "QUARANTINE" as const,
                detail: { reason: "Visual inspection failed at pack-out" },
              })),
            ];
            onCommit(entries, medic, pin, `Pack out · TIC ${ticNo} cooler ${cooler}`);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pack in
 * ------------------------------------------------------------------ */

export function PackIn({
  units,
  packTic,
  now,
  onCommit,
  onBack,
  totalUnits,
}: {
  units: Unit[];
  packTic: string | null;
  now: number;
  onCommit: Committer;
  onBack: () => void;
  totalUnits: number;
}) {
  const [tic, setTic] = useState<"pass" | "fail" | null>(null);
  const [ticNo, setTicNo] = useState(String(packTic ?? ""));
  const [toTic, setToTic] = useState("");
  const [swaps, setSwaps] = useState<{ from: string; to: string }[]>([]);
  const [scanned, setScanned] = useState<string[]>([]);
  const [signing, setSigning] = useState(false);

  const doSwap = () => {
    setSwaps((s) => [...s, { from: ticNo, to: toTic.trim() }]);
    setTicNo(toTic.trim());
    setToTic("");
    setTic(null);
  };

  const allScanned = units.every((u) => scanned.includes(u.id));
  const ready = tic === "pass" && allScanned;

  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        Back
      </button>
      <h2 className="mt-4 text-[24px] font-semibold tracking-tight">Put the pack back</h2>
      <p className="mt-1 max-w-[42ch] text-[16px] leading-relaxed text-zinc-600">
        {units.length === totalUnits
          ? "Both units coming back in."
          : `${units.length} unit${units.length === 1 ? "" : "s"} coming back — the rest is already accounted for.`}
      </p>

      <Field label={`Check TIC ${ticNo}`} hint="Seal, coolant, condition.">
        <Toggle value={tic} onChange={setTic} />
      </Field>
      {tic === "fail" && <TicSwapPanel fromTic={ticNo} toTic={toTic} setToTic={setToTic} onSwapped={doSwap} />}

      {tic === "pass" && (
        <Field label="Confirm the units going back in" hint="Tap a row to scan it.">
          <div className="space-y-3">
            {units.map((u) => (
              <ScanRow
                key={u.id}
                unit={u}
                scanned={scanned.includes(u.id)}
                onScan={() =>
                  setScanned((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))
                }
              />
            ))}
          </div>
        </Field>
      )}

      <div className="mt-8">
        <Button onClick={() => setSigning(true)} disabled={!ready}>
          Sign and log
        </Button>
        <div className="mt-3 text-center text-[13px] text-zinc-500">
          Timestamped {mdy(new Date(now))} at {hhmm(new Date(now))}
        </div>
      </div>

      {signing && (
        <PinPad
          summary={`Return ${units.map((u) => u.id.slice(1)).join(" + ")} to the fridge`}
          onCancel={() => setSigning(false)}
          onSigned={(medic, pin) => {
            setSigning(false);
            onCommit(
              units.map((u) => ({
                unitId: u.id,
                type: "RET" as const,
                detail: { tic: "pass" as const, ticNo, ...(swaps.length ? { swaps } : {}) },
              })),
              medic,
              pin,
              "Pack in"
            );
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * TIC rotation while out
 * ------------------------------------------------------------------ */

export function RotateTic({
  units,
  packTic,
  now,
  onCommit,
  onBack,
}: {
  units: Unit[];
  packTic: string | null;
  now: number;
  onCommit: Committer;
  onBack: () => void;
}) {
  const [toTic, setToTic] = useState("");
  const [swapped, setSwapped] = useState(false);
  const [tic, setTic] = useState<"pass" | "fail" | null>(null);
  const [reason, setReason] = useState("");
  const [signing, setSigning] = useState(false);
  const [current, setCurrent] = useState(String(packTic ?? ""));

  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        Back
      </button>
      <h2 className="mt-4 text-[24px] font-semibold tracking-tight">Rotate the TIC</h2>
      <p className="mt-1 max-w-[42ch] text-[16px] leading-relaxed text-zinc-600">
        Both units move to the new insert together. Their custody doesn&apos;t change.
      </p>

      {!swapped ? (
        <TicSwapPanel
          fromTic={current}
          toTic={toTic}
          setToTic={setToTic}
          onSwapped={() => {
            setSwapped(true);
            setCurrent(toTic.trim());
          }}
        />
      ) : (
        <>
          <Field label={`Check TIC ${current}`} hint="Seal, coolant, condition.">
            <Toggle value={tic} onChange={setTic} />
          </Field>
          <Field label="What was wrong with the old one?" hint="Builds the equipment record.">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Coolant spent, insert warm to the touch"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
            />
          </Field>
        </>
      )}

      <div className="mt-8">
        <Button onClick={() => setSigning(true)} disabled={!swapped || tic !== "pass"}>
          Sign and log
        </Button>
        <div className="mt-3 text-center text-[13px] text-zinc-500">
          Timestamped {mdy(new Date(now))} at {hhmm(new Date(now))}
        </div>
      </div>

      {signing && (
        <PinPad
          summary={`Rotate TIC ${packTic} out for TIC ${current}`}
          onCancel={() => setSigning(false)}
          onSigned={(medic, pin) => {
            setSigning(false);
            onCommit(
              units.map((u) => ({
                unitId: u.id,
                type: "TIC_SWAP" as const,
                detail: {
                  fromTic: String(packTic ?? ""),
                  toTic: current,
                  tic: "pass" as const,
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                },
              })),
              medic,
              pin,
              `TIC ${packTic} → ${current}`
            );
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Single unit — transfuse, discard, return, flag
 * ------------------------------------------------------------------ */

type Mode = "TRANSFUSE" | "DISCARD" | "RETURN_BB" | "FLAG";

export function UnitScreen({
  unit,
  snap,
  now,
  onCommit,
  onBack,
}: {
  unit: Unit;
  snap: UnitSnapshot;
  now: number;
  onCommit: Committer;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [mrn, setMrn] = useState("");
  const [mrnPending, setMrnPending] = useState(false);
  const [incident, setIncident] = useState("");
  const [reason, setReason] = useState("");
  const [signing, setSigning] = useState(false);

  const reset = () => {
    setMode(null);
    setMrn("");
    setMrnPending(false);
    setIncident("");
    setReason("");
  };

  const ready = () => {
    if (mode === "TRANSFUSE") return mrnPending ? incident.trim() !== "" : mrn.trim() !== "";
    if (mode === "DISCARD") return reason.trim() !== "";
    if (mode === "RETURN_BB") return true;
    if (mode === "FLAG") return reason.trim() !== "";
    return false;
  };

  const summary = () => {
    const n = unit.unitNumber;
    if (mode === "TRANSFUSE") return `Mark ${n} transfused`;
    if (mode === "DISCARD") return `Discard ${n}`;
    if (mode === "RETURN_BB") return `Send ${n} back to the blood bank`;
    if (mode === "FLAG") return `Flag ${n} for blood bank review`;
    return "";
  };

  const commit = (medic: { id: string; name: string }, pin: string) => {
    if (!mode) return;
    const detail: EventDetail = {};
    if (mode === "TRANSFUSE") {
      if (mrnPending) {
        detail.incident = incident.trim();
        detail.mrnPending = true;
      } else detail.mrn = mrn.trim();
    }
    if (mode === "DISCARD" || mode === "FLAG") detail.reason = reason.trim();
    onCommit([{ unitId: unit.id, type: mode, detail }], medic, pin, summary());
  };

  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={mode ? reset : onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        {mode ? "Choose something else" : "Back"}
      </button>

      <div className="mt-4">
        <UnitTag unit={unit} snap={snap} now={now} showClock />
      </div>

      {!mode && (
        <div className="mt-6 space-y-3">
          {snap.state === "IN_COOLER" && (
            <>
              <Button onClick={() => setMode("TRANSFUSE")}>Mark transfused</Button>
              <Button variant="quiet" onClick={() => setMode("DISCARD")}>
                Discard
              </Button>
              <div className="pt-1 text-center text-[14px] leading-relaxed text-zinc-500">
                Putting it back in the fridge happens with the whole pack, from the main screen.
              </div>
            </>
          )}
          {snap.state === "IN_FRIDGE" && (
            <Button variant="quiet" onClick={() => setMode("RETURN_BB")}>
              Send back to the blood bank
            </Button>
          )}
          {snap.state === "QUARANTINE" && (
            <>
              <div className="rounded-xl bg-rose-50 p-4 text-[15px] leading-relaxed text-rose-900 ring-1 ring-rose-200">
                This unit failed inspection and can&apos;t go back into storage or into a patient.
              </div>
              <Button variant="danger" onClick={() => setMode("DISCARD")}>
                Discard
              </Button>
            </>
          )}
          {TERMINAL.includes(snap.state) && (
            <div className="rounded-xl bg-zinc-100 p-4 text-[15px] leading-relaxed text-zinc-700">
              This unit&apos;s record is closed. Nothing further to log.
            </div>
          )}
          {!TERMINAL.includes(snap.state) && (
            <button
              onClick={() => setMode("FLAG")}
              className="w-full pt-2 text-center text-[15px] text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
            >
              Something looks off — flag for blood bank review
            </button>
          )}
        </div>
      )}

      {mode === "TRANSFUSE" && (
        <>
          {!mrnPending ? (
            <Field label="MRN" hint="The patient's medical record number.">
              <input
                value={mrn}
                onChange={(e) => setMrn(e.target.value)}
                placeholder="0012345678"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[18px] focus:border-zinc-900 focus:outline-none"
              />
            </Field>
          ) : (
            <Field label="Incident number" hint="The blood bank matches the MRN to this afterwards.">
              <input
                value={incident}
                onChange={(e) => setIncident(e.target.value)}
                placeholder="2026-0904-017"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[17px] focus:border-zinc-900 focus:outline-none"
              />
            </Field>
          )}
          <button
            onClick={() => setMrnPending(!mrnPending)}
            className="mt-3 text-[15px] text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            {mrnPending ? "I have the MRN" : "No MRN yet — log the incident number"}
          </button>
        </>
      )}

      {(mode === "DISCARD" || mode === "FLAG") && (
        <Field label={mode === "DISCARD" ? "Reason for discard" : "What's wrong?"}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={mode === "DISCARD" ? "Bag damaged in transport" : "Bag felt warmer than expected"}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
          />
        </Field>
      )}

      {mode === "RETURN_BB" && (
        <div className="mt-5 rounded-xl bg-zinc-100 p-4 text-[15px] leading-relaxed text-zinc-700">
          Logs the unit as leaving this location. The blood bank confirms it on their end when it arrives.
        </div>
      )}

      {mode && (
        <div className="mt-8">
          <Button onClick={() => setSigning(true)} disabled={!ready()}>
            Sign and log
          </Button>
          <div className="mt-3 text-center text-[13px] text-zinc-500">
            Timestamped {mdy(new Date(now))} at {hhmm(new Date(now))}
          </div>
        </div>
      )}

      {signing && (
        <PinPad
          summary={summary()}
          onCancel={() => setSigning(false)}
          onSigned={(medic, pin) => {
            setSigning(false);
            commit(medic, pin);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Receive a fresh consignment away from the hangar — the hospital-side
 * swap. Whatever's still open from the current pack (a leftover unit if
 * only one transfused, nothing if both did) gets handed to that blood
 * bank; a brand-new pair gets packed into the same TIC and cooler.
 * ------------------------------------------------------------------ */

const NEW_UNIT_PRODUCT_CODE = "E0336";
const NEW_UNIT_ABO_RH = "O Neg";

// Consignment IDs aren't something a medic ever types or reads off a real
// paper form for these app-created consignments — the original blood-bank
// issue has one printed on it, but a hospital swap or a restock doesn't.
// The app generates its own, quietly, as an internal record identifier.
function autoConsignmentId(location: string, nextSeq: number): string {
  const code = location.startsWith("Mac") ? "MAC" : location.startsWith("Gab") ? "GAB" : "LOC";
  return `${code}-${nextSeq}`;
}

type UnitEntry = { raw: string; din: Din | null };

function validateNewUnitScan(raw: string): { ok: true; value: Din } | { ok: false; message: string } {
  const r = resolveScan(raw, [] as { id: string; dinKey: string }[]);
  if (r.ok) return { ok: true, value: r.din };
  if (r.din) return { ok: true, value: r.din };
  return { ok: false, message: r.message };
}


export function ReceiveConsignment({
  location,
  leftoverUnits,
  nextSeq,
  prefillTic,
  prefillCooler,
  now,
  onCommit,
  onBack,
}: {
  location: string;
  leftoverUnits: Unit[];
  nextSeq: number;
  prefillTic: string | null;
  prefillCooler: string | null;
  now: number;
  onCommit: ConsignmentCommitter;
  onBack: () => void;
}) {
  const [issuedBy, setIssuedBy] = useState("");
  const [unitEntries, setUnitEntries] = useState<[UnitEntry, UnitEntry]>([
    { raw: "", din: null },
    { raw: "", din: null },
  ]);
  const [scanning, setScanning] = useState<0 | 1 | null>(null);
  const [expires, setExpires] = useState<[string, string]>(["", ""]);
  const [visuals, setVisuals] = useState<[("pass" | "fail" | null), ("pass" | "fail" | null)]>([null, null]);
  const [ticNo, setTicNo] = useState(String(prefillTic ?? ""));
  const [tic, setTic] = useState<"pass" | "fail" | null>(null);
  const [toTic, setToTic] = useState("");
  const [cooler, setCooler] = useState(String(prefillCooler ?? ""));
  const [signing, setSigning] = useState(false);

  const consignmentId = autoConsignmentId(location, nextSeq);
  const dins = unitEntries.map((e) => e.din);
  const unitNumbersEntered = unitEntries.every((e) => e.raw.trim());
  const unitNumbersValid = dins.every((d) => d !== null);
  const expiresEntered = expires.every((e) => e.trim());
  const visualsSet = visuals.every((v) => v !== null);
  const passing = [0, 1].filter((i) => visuals[i] === "pass") as (0 | 1)[];
  const failing = [0, 1].filter((i) => visuals[i] === "fail") as (0 | 1)[];

  const ready =
    issuedBy.trim() &&
    unitNumbersEntered &&
    unitNumbersValid &&
    expiresEntered &&
    visualsSet &&
    passing.length > 0 &&
    ticNo.trim() &&
    tic === "pass" &&
    cooler.trim();

  const summary = `Receive ${consignmentId.trim()} into TIC ${ticNo} · cooler ${cooler}`;

  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        Back
      </button>
      <h2 className="mt-4 text-[24px] font-semibold tracking-tight">Receive new consignment</h2>
      <p className="mt-1 max-w-[42ch] text-[16px] leading-relaxed text-zinc-600">
        At the hospital, hand off whatever&apos;s left and log the fresh pair going back into the
        same TIC and cooler.
      </p>

      {leftoverUnits.length > 0 && (
        <Field
          label="Handing off to this blood bank"
          hint="Still open from the current pack — no further input needed."
        >
          <div className="space-y-2">
            {leftoverUnits.map((u) => (
              <div
                key={u.id}
                className="rounded-xl bg-zinc-100 px-4 py-3 text-[15px] text-zinc-700"
              >
                Unit {u.id.slice(1)} · <span className="font-mono">{u.unitNumber}</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label="Issued by" hint="Hospital blood bank technologist.">
        <input
          value={issuedBy}
          onChange={(e) => setIssuedBy(e.target.value)}
          placeholder="Name"
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
        />
      </Field>

      {([0, 1] as const).map((i) => (
        <div key={i} className="mt-5 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-[14px] font-semibold text-zinc-500">New unit {i === 0 ? "A" : "B"}</div>
          <div className="mt-2 text-[13px] text-zinc-500">{NEW_UNIT_ABO_RH} · {NEW_UNIT_PRODUCT_CODE}</div>
          <Field label="Unit number">
            <div className="flex gap-2">
              <input
                value={unitEntries[i].raw}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = [...unitEntries] as [UnitEntry, UnitEntry];
                  next[i] = { raw, din: raw.trim() ? parsePrintedUnitNumber(raw) : null };
                  setUnitEntries(next);
                }}
                placeholder="W1833 26 411203 8"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[16px] focus:border-zinc-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setScanning(i)}
                className="shrink-0 rounded-xl bg-zinc-900 px-4 py-3 text-[15px] font-semibold text-white active:scale-[.99]"
              >
                Scan
              </button>
            </div>
            {unitEntries[i].raw.trim() && !dins[i] && (
              <div className="mt-1.5 text-[14px] text-rose-700">
                Doesn&apos;t look like a full unit number — check for a missing or extra digit.
              </div>
            )}
          </Field>
          {scanning === i && (
            <Scanner
              title={`Scan new unit ${i === 0 ? "A" : "B"}`}
              validateScan={validateNewUnitScan}
              validateManual={(raw) => {
                const din = parsePrintedUnitNumber(raw);
                if (!din) {
                  return { ok: false, message: "Doesn't look like a full unit number — check for a missing or extra digit." };
                }
                return { ok: true, value: din };
              }}
              onAccepted={(din) => {
                setScanning(null);
                const next = [...unitEntries] as [UnitEntry, UnitEntry];
                next[i] = { raw: din.display, din };
                setUnitEntries(next);
              }}
              onCancel={() => setScanning(null)}
            />
          )}
          <Field label="Expires">
            <input
              type="date"
              value={expires[i]}
              onChange={(e) => {
                const next = [...expires] as [string, string];
                next[i] = e.target.value;
                setExpires(next);
              }}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
            />
          </Field>
          <Field label="Visual inspection">
            <Toggle
              value={visuals[i]}
              onChange={(v) => {
                const next = [...visuals] as [("pass" | "fail" | null), ("pass" | "fail" | null)];
                next[i] = v;
                setVisuals(next);
              }}
            />
          </Field>
        </div>
      ))}

      {failing.length > 0 && (
        <div className="mt-4 rounded-xl bg-rose-50 p-4 text-[15px] leading-relaxed text-rose-900 ring-1 ring-rose-200">
          New unit{failing.length > 1 ? "s" : ""} {failing.map((i) => (i === 0 ? "A" : "B")).join(" and ")}{" "}
          fail{failing.length === 1 ? "s" : ""} inspection and won&apos;t go out. Tell the hospital blood
          bank before leaving.
        </div>
      )}

      {visualsSet && passing.length > 0 && (
        <>
          <Field label="TIC number" hint="The insert both units ride in.">
            <NumInput value={ticNo} onChange={(e) => setTicNo(e.target.value)} placeholder="4" />
          </Field>
          {ticNo.trim() && (
            <Field label={`Check TIC ${ticNo.trim()}`} hint="Seal, coolant, condition.">
              <Toggle value={tic} onChange={setTic} />
            </Field>
          )}
          {tic === "fail" && (
            <TicSwapPanel
              fromTic={ticNo}
              toTic={toTic}
              setToTic={setToTic}
              onSwapped={() => {
                setTicNo(toTic.trim());
                setToTic("");
                setTic(null);
              }}
            />
          )}
          {tic === "pass" && (
            <Field label="Cooler number" hint="The soft cooler the insert sits in.">
              <NumInput value={cooler} onChange={(e) => setCooler(e.target.value)} placeholder="1" />
            </Field>
          )}
        </>
      )}

      <div className="mt-8">
        <Button onClick={() => setSigning(true)} disabled={!ready}>
          Sign and log
        </Button>
        <div className="mt-3 text-center text-[13px] text-zinc-500">
          Timestamped {mdy(new Date(now))} at {hhmm(new Date(now))}
        </div>
      </div>

      {signing && (
        <PinPad
          summary={summary}
          onCancel={() => setSigning(false)}
          onSigned={(medic, pin) => {
            setSigning(false);
            const idA = `U${nextSeq}A`;
            const idB = `U${nextSeq}B`;
            const ids: [string, string] = [idA, idB];
            const nowIso = new Date(now).toISOString();

            const consignment: NewConsignmentInput = {
              id: consignmentId.trim(),
              location,
              issuedBy: issuedBy.trim(),
              issuedAt: nowIso,
              medicId: medic.id,
              units: ([0, 1] as const).map((i) => {
                const din = dins[i]!;
                return {
                  id: ids[i],
                  unitNumber: unitEntries[i].raw.trim(),
                  facility: din.facility,
                  collectionYear: din.year,
                  serial: din.serial,
                  productCode: NEW_UNIT_PRODUCT_CODE,
                  aboRh: NEW_UNIT_ABO_RH,
                  expires: new Date(`${expires[i]}T23:59:00`).toISOString(),
                };
              }),
            };

            const entries: Entry[] = [
              ...leftoverUnits.map((u) => ({
                unitId: u.id,
                type: "RETURN_BB" as const,
                detail: { note: "Handed to hospital blood bank at consignment swap" },
              })),
              ...passing.map((i) => ({
                unitId: ids[i],
                type: "REM" as const,
                detail: {
                  visual: "pass" as const,
                  ticNo: ticNo.trim(),
                  cooler: cooler.trim(),
                  tic: "pass" as const,
                },
              })),
              ...failing.map((i) => ({
                unitId: ids[i],
                type: "QUARANTINE" as const,
                detail: { reason: "Visual inspection failed at hospital pack-out" },
              })),
            ];

            onCommit(consignment, entries, medic, pin, `Received ${consignmentId.trim()}`);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Biweekly base restock — supervisor-only. Whatever's currently in the
 * fridge (unused) goes back to the hospital blood bank; a fresh pair
 * lands straight in the fridge. No TIC/cooler step — nothing is being
 * packed for transport here, just stocked.
 * ------------------------------------------------------------------ */

export function RestockBase({
  location,
  oldUnits,
  nextSeq,
  now,
  onCommit,
  onBack,
}: {
  location: string;
  oldUnits: Unit[];
  nextSeq: number;
  now: number;
  onCommit: RestockCommitter;
  onBack: () => void;
}) {
  const [issuedBy, setIssuedBy] = useState("");
  const [unitEntries, setUnitEntries] = useState<[UnitEntry, UnitEntry]>([
    { raw: "", din: null },
    { raw: "", din: null },
  ]);
  const [scanning, setScanning] = useState<0 | 1 | null>(null);
  const [expires, setExpires] = useState<[string, string]>(["", ""]);
  const [visuals, setVisuals] = useState<[("pass" | "fail" | null), ("pass" | "fail" | null)]>([null, null]);
  const [signing, setSigning] = useState(false);

  const consignmentId = autoConsignmentId(location, nextSeq);
  const dins = unitEntries.map((e) => e.din);
  const unitNumbersEntered = unitEntries.every((e) => e.raw.trim());
  const unitNumbersValid = dins.every((d) => d !== null);
  const expiresEntered = expires.every((e) => e.trim());
  const visualsSet = visuals.every((v) => v !== null);
  const passing = [0, 1].filter((i) => visuals[i] === "pass") as (0 | 1)[];
  const failing = [0, 1].filter((i) => visuals[i] === "fail") as (0 | 1)[];

  const ready =
    issuedBy.trim() &&
    unitNumbersEntered &&
    unitNumbersValid &&
    expiresEntered &&
    visualsSet &&
    passing.length > 0;

  const summary = `Restock ${location} with ${consignmentId.trim()}`;

  return (
    <div className="px-5 pb-10 pt-4">
      <button onClick={onBack} className="text-[15px] text-zinc-600 hover:text-zinc-900">
        Back
      </button>
      <h2 className="mt-4 text-[24px] font-semibold tracking-tight">Restock this base</h2>
      <p className="mt-1 max-w-[42ch] text-[16px] leading-relaxed text-zinc-600">
        Scheduled biweekly swap — supervisor sign-off required. Whatever&apos;s in the fridge goes
        back to the blood bank; the fresh pair goes straight in.
      </p>

      {oldUnits.length > 0 && (
        <Field
          label="Returning to the hospital blood bank"
          hint="Currently in the fridge — no further input needed."
        >
          <div className="space-y-2">
            {oldUnits.map((u) => (
              <div key={u.id} className="rounded-xl bg-zinc-100 px-4 py-3 text-[15px] text-zinc-700">
                Unit {u.id.slice(1)} · <span className="font-mono">{u.unitNumber}</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label="Issued by" hint="Blood bank technologist.">
        <input
          value={issuedBy}
          onChange={(e) => setIssuedBy(e.target.value)}
          placeholder="Name"
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
        />
      </Field>

      {([0, 1] as const).map((i) => (
        <div key={i} className="mt-5 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-[14px] font-semibold text-zinc-500">New unit {i === 0 ? "A" : "B"}</div>
          <div className="mt-2 text-[13px] text-zinc-500">{NEW_UNIT_ABO_RH} · {NEW_UNIT_PRODUCT_CODE}</div>
          <Field label="Unit number">
            <div className="flex gap-2">
              <input
                value={unitEntries[i].raw}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = [...unitEntries] as [UnitEntry, UnitEntry];
                  next[i] = { raw, din: raw.trim() ? parsePrintedUnitNumber(raw) : null };
                  setUnitEntries(next);
                }}
                placeholder="W1833 26 411203 8"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[16px] focus:border-zinc-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setScanning(i)}
                className="shrink-0 rounded-xl bg-zinc-900 px-4 py-3 text-[15px] font-semibold text-white active:scale-[.99]"
              >
                Scan
              </button>
            </div>
            {unitEntries[i].raw.trim() && !dins[i] && (
              <div className="mt-1.5 text-[14px] text-rose-700">
                Doesn&apos;t look like a full unit number — check for a missing or extra digit.
              </div>
            )}
          </Field>
          {scanning === i && (
            <Scanner
              title={`Scan new unit ${i === 0 ? "A" : "B"}`}
              validateScan={validateNewUnitScan}
              validateManual={(raw) => {
                const din = parsePrintedUnitNumber(raw);
                if (!din) {
                  return { ok: false, message: "Doesn't look like a full unit number — check for a missing or extra digit." };
                }
                return { ok: true, value: din };
              }}
              onAccepted={(din) => {
                setScanning(null);
                const next = [...unitEntries] as [UnitEntry, UnitEntry];
                next[i] = { raw: din.display, din };
                setUnitEntries(next);
              }}
              onCancel={() => setScanning(null)}
            />
          )}
          <Field label="Expires">
            <input
              type="date"
              value={expires[i]}
              onChange={(e) => {
                const next = [...expires] as [string, string];
                next[i] = e.target.value;
                setExpires(next);
              }}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
            />
          </Field>
          <Field label="Visual inspection">
            <Toggle
              value={visuals[i]}
              onChange={(v) => {
                const next = [...visuals] as [("pass" | "fail" | null), ("pass" | "fail" | null)];
                next[i] = v;
                setVisuals(next);
              }}
            />
          </Field>
        </div>
      ))}

      {failing.length > 0 && (
        <div className="mt-4 rounded-xl bg-rose-50 p-4 text-[15px] leading-relaxed text-rose-900 ring-1 ring-rose-200">
          New unit{failing.length > 1 ? "s" : ""} {failing.map((i) => (i === 0 ? "A" : "B")).join(" and ")}{" "}
          fail{failing.length === 1 ? "s" : ""} inspection and won&apos;t be stocked. Tell the blood
          bank before they leave.
        </div>
      )}

      <div className="mt-8">
        <Button onClick={() => setSigning(true)} disabled={!ready}>
          Sign and log
        </Button>
        <div className="mt-3 text-center text-[13px] text-zinc-500">
          Timestamped {mdy(new Date(now))} at {hhmm(new Date(now))}
        </div>
      </div>

      {signing && (
        <PinPad
          summary={summary}
          onCancel={() => setSigning(false)}
          onSigned={(medic, pin) => {
            setSigning(false);
            const idA = `U${nextSeq}A`;
            const idB = `U${nextSeq}B`;
            const ids: [string, string] = [idA, idB];
            const nowIso = new Date(now).toISOString();

            const consignment: Omit<NewConsignmentInput, "medicId"> = {
              id: consignmentId.trim(),
              location,
              issuedBy: issuedBy.trim(),
              issuedAt: nowIso,
              units: passing.map((i) => {
                const din = dins[i]!;
                return {
                  id: ids[i],
                  unitNumber: unitEntries[i].raw.trim(),
                  facility: din.facility,
                  collectionYear: din.year,
                  serial: din.serial,
                  productCode: NEW_UNIT_PRODUCT_CODE,
                  aboRh: NEW_UNIT_ABO_RH,
                  expires: new Date(`${expires[i]}T23:59:00`).toISOString(),
                };
              }),
            };

            onCommit(
              oldUnits.map((u) => u.id),
              consignment,
              medic,
              pin,
              `Restocked ${consignmentId.trim()}`
            );
          }}
        />
      )}
    </div>
  );
}
