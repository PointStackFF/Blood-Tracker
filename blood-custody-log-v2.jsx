import React, { useState, useEffect, useMemo } from "react";

/* ------------------------------------------------------------------ *
 * Seed — the real consignment from the paper log
 * ------------------------------------------------------------------ */

const CONSIGNMENT = {
  id: "C-17247-22",
  location: "MacArthur Airport",
  issuedBy: "K. Reagan",
  issuedAt: "2026-08-25T08:36:00",
};

const UNITS = [
  {
    id: "UA",
    unitNumber: "W1833 26 3130438",
    productCode: "E0336",
    aboRh: "O Neg",
    expires: "2026-09-17T23:59:00",
  },
  {
    id: "UB",
    unitNumber: "W1833 26 3373718",
    productCode: "E0336",
    aboRh: "O Neg",
    expires: "2026-09-17T23:59:00",
  },
];

const SEED_EVENTS = UNITS.map((u, i) => ({
  seq: i + 1,
  unitId: u.id,
  type: "ISSUE",
  at: CONSIGNMENT.issuedAt,
  medic: "K. Reagan",
  batch: "b0",
  detail: { note: "Released from blood bank, stock moved in WellSky" },
}));

const MEDICS = { "4417": "J. Marek", "2280": "R. Ellis" };

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const STATES = {
  IN_FRIDGE: { label: "In fridge", tone: "sky" },
  IN_COOLER: { label: "Out with the pack", tone: "amber" },
  QUARANTINE: { label: "Quarantined", tone: "rose" },
  TRANSFUSED: { label: "Transfused", tone: "zinc" },
  DISCARDED: { label: "Discarded", tone: "zinc" },
  RETURNED_BB: { label: "Returned to blood bank", tone: "zinc" },
};

const TERMINAL = ["TRANSFUSED", "DISCARDED", "RETURNED_BB"];

function replay(events, unitId) {
  const mine = events.filter((e) => e.unitId === unitId);
  let state = "IN_FRIDGE";
  let cooler = null;
  let tic = null;
  let since = mine[0]?.at ?? null;
  for (const e of mine) {
    if (e.type === "REM") {
      state = "IN_COOLER";
      cooler = e.detail.cooler;
      tic = e.detail.ticNo;
      since = e.at;
    } else if (e.type === "TIC_SWAP") {
      tic = e.detail.toTic;
    } else if (e.type === "RET") {
      state = "IN_FRIDGE";
      cooler = null;
      tic = null;
      since = e.at;
    } else if (e.type === "QUARANTINE") {
      state = "QUARANTINE";
      since = e.at;
    } else if (e.type === "TRANSFUSE") {
      state = "TRANSFUSED";
      since = e.at;
    } else if (e.type === "DISCARD") {
      state = "DISCARDED";
      since = e.at;
    } else if (e.type === "RETURN_BB") {
      state = "RETURNED_BB";
      since = e.at;
    }
  }
  return { state, cooler, tic, since };
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
const mdy = (d) =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(2)}`;

function elapsed(fromIso, now) {
  const ms = now - new Date(fromIso).getTime();
  if (ms < 0) return "00:00";
  const m = Math.floor(ms / 60000);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

const daysLeft = (iso, now) =>
  Math.ceil((new Date(iso).getTime() - now) / 86400000);

const TONE = {
  sky: { chip: "bg-sky-100 text-sky-900 ring-sky-300", bar: "bg-sky-500" },
  amber: { chip: "bg-amber-100 text-amber-900 ring-amber-400", bar: "bg-amber-500" },
  rose: { chip: "bg-rose-100 text-rose-900 ring-rose-400", bar: "bg-rose-500" },
  zinc: { chip: "bg-zinc-200 text-zinc-700 ring-zinc-300", bar: "bg-zinc-400" },
};

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Chip({ tone, children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-medium ring-1 ${TONE[tone].chip}`}
    >
      {children}
    </span>
  );
}

function Button({ variant = "primary", className = "", ...props }) {
  const base =
    "w-full rounded-xl px-5 py-4 text-[17px] font-semibold transition active:scale-[.99] disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300";
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800",
    danger: "bg-rose-700 text-white hover:bg-rose-600",
    quiet: "bg-white text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-50",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

function Field({ label, hint, children }) {
  return (
    <div className="mt-5">
      <div className="text-[16px] font-medium text-zinc-900">{label}</div>
      {hint && <div className="mt-0.5 text-[14px] text-zinc-500">{hint}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {["pass", "fail"].map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-xl py-4 text-[17px] font-semibold capitalize ring-1 transition ${
            value === v
              ? v === "pass"
                ? "bg-emerald-600 text-white ring-emerald-600"
                : "bg-rose-700 text-white ring-rose-700"
              : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function NumInput(props) {
  return (
    <input
      inputMode="numeric"
      className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[18px] focus:border-zinc-900 focus:outline-none"
      {...props}
    />
  );
}

/* The bag label. */
function UnitTag({ unit, snap, now, onClick, showClock }) {
  const s = STATES[snap.state];
  const left = daysLeft(unit.expires, now);
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300"
    >
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-300">
        <div className={`h-1.5 w-full ${TONE[s.tone].bar}`} />
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold tracking-wide text-zinc-500">
              Unit {unit.id.slice(1)}
            </span>
            <Chip tone={s.tone}>{s.label}</Chip>
          </div>
          <div className="mt-2 font-mono text-[19px] leading-tight tracking-tight text-zinc-900">
            {unit.unitNumber}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] text-zinc-700">
            <span className="font-semibold text-zinc-900">{unit.aboRh}</span>
            <span className="font-mono">{unit.productCode}</span>
            <span className={left <= 3 ? "font-medium text-rose-700" : ""}>
              Expires {mdy(new Date(unit.expires))} · {left}d
            </span>
          </div>
          {showClock && snap.state === "IN_COOLER" && (
            <div className="mt-3 border-t border-zinc-200 pt-3 text-[14px] text-zinc-500">
              Out since {hhmm(new Date(snap.since))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* Scan confirmation row used when packing and unpacking. */
function ScanRow({ unit, scanned, onScan }) {
  return (
    <button
      onClick={onScan}
      className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 ring-1 transition ${
        scanned
          ? "bg-emerald-50 ring-emerald-400"
          : "bg-white ring-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <div className="text-left">
        <div className="text-[13px] font-semibold text-zinc-500">
          Unit {unit.id.slice(1)}
        </div>
        <div className="font-mono text-[16px] text-zinc-900">{unit.unitNumber}</div>
      </div>
      <span
        className={`text-[15px] font-medium ${
          scanned ? "text-emerald-700" : "text-zinc-400"
        }`}
      >
        {scanned ? "Scanned" : "Scan"}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * PIN pad
 * ------------------------------------------------------------------ */

function PinPad({ summary, onCancel, onSigned }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const press = (d) => {
    setError("");
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      const who = MEDICS[next];
      if (who) setTimeout(() => onSigned(who), 120);
      else
        setTimeout(() => {
          setError("That PIN isn't recognized. Try again.");
          setPin("");
        }, 120);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-zinc-900/70 p-4 backdrop-blur-sm">
      <div className="mt-auto rounded-3xl bg-white p-6">
        <div className="text-[15px] text-zinc-500">Sign this entry</div>
        <div className="mt-1 text-[19px] font-semibold leading-snug text-zinc-900">
          {summary}
        </div>
        <div className="mt-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full ring-1 ring-zinc-400 ${
                i < pin.length ? "bg-zinc-900" : ""
              }`}
            />
          ))}
        </div>
        <div className="mt-3 h-5 text-center text-[14px] text-rose-700">{error}</div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="rounded-xl bg-zinc-100 py-5 font-mono text-[24px] hover:bg-zinc-200 active:scale-[.98]"
            >
              {d}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="rounded-xl py-5 text-[16px] text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            onClick={() => press("0")}
            className="rounded-xl bg-zinc-100 py-5 font-mono text-[24px] hover:bg-zinc-200 active:scale-[.98]"
          >
            0
          </button>
          <button
            onClick={() => setPin(pin.slice(0, -1))}
            className="rounded-xl py-5 text-[16px] text-zinc-600 hover:bg-zinc-100"
          >
            Delete
          </button>
        </div>
        <div className="mt-4 text-center text-[13px] text-zinc-500">
          Demo PINs: 4417 (J. Marek) · 2280 (R. Ellis)
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * TIC rotation panel
 * ------------------------------------------------------------------ */

function TicSwapPanel({ fromTic, toTic, setToTic, onSwapped }) {
  const same = toTic.trim() && toTic.trim() === String(fromTic);
  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <div className="text-[15px] font-medium text-amber-900">
        Rotate in a good insert
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-amber-900">
        TIC {fromTic || "—"} failed, not the blood. Swap it for a spare in the
        same cooler, then check the new one.
      </p>
      <input
        value={toTic}
        onChange={(e) => setToTic(e.target.value)}
        inputMode="numeric"
        placeholder="Replacement TIC number"
        className="mt-3 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 font-mono text-[17px] focus:border-amber-900 focus:outline-none"
      />
      <button
        onClick={onSwapped}
        disabled={!toTic.trim() || same}
        className="mt-3 w-full rounded-xl bg-amber-900 px-4 py-3 text-[16px] font-semibold text-white hover:bg-amber-800 active:scale-[.99] disabled:opacity-40"
      >
        Insert swapped — check TIC {toTic.trim() || "—"}
      </button>
      {same && (
        <div className="mt-2 text-[14px] text-amber-900">
          That's the insert that just failed. Pick a different one.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pack out — one flow, both units
 * ------------------------------------------------------------------ */

function PackOut({ units, now, onCommit, onBack }) {
  const [scanned, setScanned] = useState([]);
  const [visual, setVisual] = useState({});
  const [ticNo, setTicNo] = useState("");
  const [tic, setTic] = useState(null);
  const [toTic, setToTic] = useState("");
  const [swaps, setSwaps] = useState([]);
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
    allScanned &&
    allInspected &&
    passing.length > 0 &&
    ticNo.trim() &&
    tic === "pass" &&
    cooler.trim();

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

      <Field label="Confirm the units" hint="Tap a label to simulate a scan.">
        <div className="space-y-3">
          {units.map((u) => (
            <ScanRow
              key={u.id}
              unit={u}
              scanned={scanned.includes(u.id)}
              onScan={() =>
                setScanned((s) =>
                  s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]
                )
              }
            />
          ))}
        </div>
      </Field>

      {allScanned && (
        <Field
          label="Visual inspection"
          hint="Each bag separately — clots, discoloration, leaks, damaged seal."
        >
          <div className="space-y-4">
            {units.map((u) => (
              <div key={u.id}>
                <div className="mb-1.5 text-[14px] text-zinc-600">
                  Unit {u.id.slice(1)} · <span className="font-mono">{u.unitNumber}</span>
                </div>
                <Toggle
                  value={visual[u.id]}
                  onChange={(v) => setVisual((s) => ({ ...s, [u.id]: v }))}
                />
              </div>
            ))}
          </div>
        </Field>
      )}

      {failing.length > 0 && (
        <div className="mt-4 rounded-xl bg-rose-50 p-4 text-[15px] leading-relaxed text-rose-900 ring-1 ring-rose-200">
          {failing.map((u) => `Unit ${u.id.slice(1)}`).join(" and ")}{" "}
          {failing.length > 1 ? "fail" : "fails"} inspection and won't go out.{" "}
          {passing.length > 0
            ? "The rest of the pack can still travel."
            : "Nothing is going out — tell the blood bank."}
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
          {tic === "fail" && (
            <TicSwapPanel fromTic={ticNo} toTic={toTic} setToTic={setToTic} onSwapped={doSwap} />
          )}
          {tic === "pass" && (
            <Field label="Cooler number" hint="The soft cooler the insert sits in.">
              <NumInput value={cooler} onChange={(e) => setCooler(e.target.value)} placeholder="1" />
            </Field>
          )}
        </>
      )}

      {swaps.length > 0 && tic === "pass" && (
        <div className="mt-4 rounded-xl bg-zinc-100 p-4 text-[15px] leading-relaxed text-zinc-700">
          {swaps.map((s) => `TIC ${s.from} → ${s.to}`).join(", ")} logged on this
          entry.
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
          onSigned={(medic) => {
            setSigning(false);
            const entries = [
              ...passing.map((u) => ({
                unitId: u.id,
                type: "REM",
                detail: {
                  visual: "pass",
                  ticNo: ticNo.trim(),
                  cooler: cooler.trim(),
                  tic: "pass",
                  ...(swaps.length ? { swaps } : {}),
                },
              })),
              ...failing.map((u) => ({
                unitId: u.id,
                type: "QUARANTINE",
                detail: { reason: "Visual inspection failed at pack-out" },
              })),
            ];
            onCommit(entries, medic, `Pack out · TIC ${ticNo} cooler ${cooler}`);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pack in
 * ------------------------------------------------------------------ */

function PackIn({ units, packTic, now, onCommit, onBack }) {
  const [tic, setTic] = useState(null);
  const [ticNo, setTicNo] = useState(String(packTic ?? ""));
  const [toTic, setToTic] = useState("");
  const [swaps, setSwaps] = useState([]);
  const [scanned, setScanned] = useState([]);
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
        {units.length === UNITS.length
          ? "Both units coming back in."
          : `${units.length} unit coming back — the other is already accounted for.`}
      </p>

      <Field label={`Check TIC ${ticNo}`} hint="Seal, coolant, condition.">
        <Toggle value={tic} onChange={setTic} />
      </Field>
      {tic === "fail" && (
        <TicSwapPanel fromTic={ticNo} toTic={toTic} setToTic={setToTic} onSwapped={doSwap} />
      )}

      {tic === "pass" && (
        <Field label="Confirm the units going back in" hint="Tap a label to simulate a scan.">
          <div className="space-y-3">
            {units.map((u) => (
              <ScanRow
                key={u.id}
                unit={u}
                scanned={scanned.includes(u.id)}
                onScan={() =>
                  setScanned((s) =>
                    s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]
                  )
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
          onSigned={(medic) => {
            setSigning(false);
            onCommit(
              units.map((u) => ({
                unitId: u.id,
                type: "RET",
                detail: { tic: "pass", ticNo, ...(swaps.length ? { swaps } : {}) },
              })),
              medic,
              "Pack in"
            );
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Single unit — transfuse, discard, return, rotate
 * ------------------------------------------------------------------ */

function UnitScreen({ unit, snap, now, onCommit, onBack }) {
  const [mode, setMode] = useState(null);
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

  const commit = (medic) => {
    const detail = {};
    if (mode === "TRANSFUSE") {
      if (mrnPending) {
        detail.incident = incident.trim();
        detail.mrnPending = true;
      } else detail.mrn = mrn.trim();
    }
    if (mode === "DISCARD" || mode === "FLAG") detail.reason = reason.trim();
    onCommit([{ unitId: unit.id, type: mode, detail }], medic, summary());
  };

  return (
    <div className="px-5 pb-10 pt-4">
      <button
        onClick={mode ? reset : onBack}
        className="text-[15px] text-zinc-600 hover:text-zinc-900"
      >
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
                Putting it back in the fridge happens with the whole pack, from
                the main screen.
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
                This unit failed inspection and can't go back into storage or
                into a patient.
              </div>
              <Button variant="danger" onClick={() => setMode("DISCARD")}>
                Discard
              </Button>
            </>
          )}
          {TERMINAL.includes(snap.state) && (
            <div className="rounded-xl bg-zinc-100 p-4 text-[15px] leading-relaxed text-zinc-700">
              This unit's record is closed. Nothing further to log.
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
            <Field
              label="Incident number"
              hint="The blood bank matches the MRN to this afterwards."
            >
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
            placeholder={
              mode === "DISCARD" ? "Bag damaged in transport" : "Bag felt warmer than expected"
            }
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[16px] focus:border-zinc-900 focus:outline-none"
          />
        </Field>
      )}

      {mode === "RETURN_BB" && (
        <div className="mt-5 rounded-xl bg-zinc-100 p-4 text-[15px] leading-relaxed text-zinc-700">
          Logs the unit as leaving this location. The blood bank confirms it on
          their end when it arrives.
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
          onSigned={(medic) => {
            setSigning(false);
            commit(medic);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * TIC rotation while out
 * ------------------------------------------------------------------ */

function RotateTic({ units, packTic, now, onCommit, onBack }) {
  const [toTic, setToTic] = useState("");
  const [swapped, setSwapped] = useState(false);
  const [tic, setTic] = useState(null);
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
        Both units move to the new insert together. Their custody doesn't change.
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
          onSigned={(medic) => {
            setSigning(false);
            onCommit(
              units.map((u) => ({
                unitId: u.id,
                type: "TIC_SWAP",
                detail: {
                  fromTic: String(packTic),
                  toTic: current,
                  tic: "pass",
                  ...(reason.trim() ? { reason: reason.trim() } : {}),
                },
              })),
              medic,
              `TIC ${packTic} → ${current}`
            );
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Log
 * ------------------------------------------------------------------ */

const TYPE_LABEL = {
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

function LogScreen({ events, onBack }) {
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
              {["#", "Unit", "Date", "Time", "Entry", "Details", "Signed"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const u = UNITS.find((x) => x.id === e.unitId);
              const d = new Date(e.at);
              const bits = [];
              if (e.detail.visual) bits.push(`Visual ${e.detail.visual}`);
              if (e.detail.ticNo) bits.push(`TIC ${e.detail.ticNo}`);
              if (e.detail.tic) bits.push(`TIC check ${e.detail.tic}`);
              if (e.detail.fromTic) bits.push(`TIC ${e.detail.fromTic} → ${e.detail.toTic}`);
              if (e.detail.swaps)
                bits.push(e.detail.swaps.map((s) => `TIC ${s.from} → ${s.to}`).join(", "));
              if (e.detail.cooler) bits.push(`Cooler ${e.detail.cooler}`);
              if (e.detail.mrn) bits.push(`MRN ${e.detail.mrn}`);
              if (e.detail.mrnPending)
                bits.push(`Incident ${e.detail.incident} · MRN pending`);
              if (e.detail.reason) bits.push(e.detail.reason);
              if (e.detail.note) bits.push(e.detail.note);
              return (
                <tr key={e.seq} className="border-t border-zinc-200 align-top">
                  <td className="px-3 py-2.5 font-mono text-zinc-500">{e.seq}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                    {u.id.slice(1)} · {u.unitNumber.slice(-7)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">{mdy(d)}</td>
                  <td className="px-3 py-2.5 font-mono">{hhmm(d)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">
                    {TYPE_LABEL[e.type]}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{bits.join(" · ") || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{e.medic}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

export default function App() {
  const [events, setEvents] = useState(SEED_EVENTS);
  const [view, setView] = useState("home");
  const [activeUnit, setActiveUnit] = useState(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const snaps = useMemo(
    () => Object.fromEntries(UNITS.map((u) => [u.id, replay(events, u.id)])),
    [events]
  );

  const inFridge = UNITS.filter((u) => snaps[u.id].state === "IN_FRIDGE");
  const inCooler = UNITS.filter((u) => snaps[u.id].state === "IN_COOLER");
  const open = UNITS.filter((u) => !TERMINAL.includes(snaps[u.id].state));
  const packOut = inCooler.length > 0;
  const pack = packOut ? snaps[inCooler[0].id] : null;

  const commit = (entries, medic, label) => {
    const at = new Date().toISOString();
    const batch = `b${Date.now()}`;
    setEvents((prev) => [
      ...prev,
      ...entries.map((e, i) => ({
        seq: prev.length + i + 1,
        at,
        medic,
        batch,
        ...e,
      })),
    ]);
    setToast(`${label} · signed by ${medic}`);
    setView("home");
    setActiveUnit(null);
  };

  const unit = UNITS.find((u) => u.id === activeUnit);

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-zinc-900">
      <div className="mx-auto min-h-screen max-w-[480px] bg-zinc-50 shadow-sm">
        <header className="border-b border-zinc-200 bg-white px-5 pb-4 pt-5">
          <div className="text-[20px] font-semibold tracking-tight">
            {CONSIGNMENT.location}
          </div>
          <div className="mt-0.5 text-[14px] text-zinc-500">
            Consignment {CONSIGNMENT.id} · issued{" "}
            {mdy(new Date(CONSIGNMENT.issuedAt))} by {CONSIGNMENT.issuedBy}
          </div>
        </header>

        {view === "home" && (
          <div className="px-5 pb-10 pt-5">
            {/* Pack status is the hero when the blood is out. */}
            {packOut ? (
              <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-300">
                <div className="flex items-baseline justify-between">
                  <div className="text-[15px] font-medium text-amber-900">
                    Pack out · TIC {pack.tic} in cooler {pack.cooler}
                  </div>
                  <div className="text-[13px] text-amber-800">
                    since {hhmm(new Date(pack.since))}
                  </div>
                </div>
                <div className="mt-2 font-mono text-[44px] leading-none tracking-tight text-amber-800">
                  {elapsed(pack.since, now)}
                </div>
                <div className="mt-2 text-[14px] text-amber-900">
                  {inCooler.length === 1
                    ? "1 unit travelling"
                    : `${inCooler.length} units travelling`}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-300">
                <div className="text-[15px] font-medium text-zinc-900">
                  Pack in the fridge
                </div>
                <div className="mt-1 text-[15px] leading-relaxed text-zinc-600">
                  {inFridge.length > 0
                    ? `${inFridge.length} unit${inFridge.length > 1 ? "s" : ""} stored and ready.`
                    : "Nothing left in storage here."}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-4">
              {UNITS.map((u) => (
                <UnitTag
                  key={u.id}
                  unit={u}
                  snap={snaps[u.id]}
                  now={now}
                  onClick={() => {
                    setActiveUnit(u.id);
                    setView("unit");
                  }}
                />
              ))}
            </div>

            <div className="mt-7 space-y-3">
              {packOut ? (
                <>
                  <Button onClick={() => setView("packin")}>Put the pack back</Button>
                  <Button variant="quiet" onClick={() => setView("rotate")}>
                    Rotate the TIC
                  </Button>
                </>
              ) : (
                <Button onClick={() => setView("packout")} disabled={inFridge.length === 0}>
                  Take the pack out
                </Button>
              )}
              <Button variant="quiet" onClick={() => setView("log")}>
                View custody log
              </Button>
            </div>

            <div className="mt-6 text-[14px] leading-relaxed text-zinc-500">
              {open.length === 0
                ? "Every unit in this consignment has been accounted for."
                : `${open.length} of ${UNITS.length} units still open. The blood bank sees this in real time.`}
            </div>
          </div>
        )}

        {view === "packout" && (
          <PackOut
            units={inFridge}
            now={now}
            onCommit={commit}
            onBack={() => setView("home")}
          />
        )}

        {view === "packin" && (
          <PackIn
            units={inCooler}
            packTic={pack?.tic}
            now={now}
            onCommit={commit}
            onBack={() => setView("home")}
          />
        )}

        {view === "rotate" && (
          <RotateTic
            units={inCooler}
            packTic={pack?.tic}
            now={now}
            onCommit={commit}
            onBack={() => setView("home")}
          />
        )}

        {view === "unit" && unit && (
          <UnitScreen
            unit={unit}
            snap={snaps[unit.id]}
            now={now}
            onCommit={commit}
            onBack={() => {
              setActiveUnit(null);
              setView("home");
            }}
          />
        )}

        {view === "log" && <LogScreen events={events} onBack={() => setView("home")} />}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-30 mx-auto w-[min(440px,90vw)] rounded-xl bg-zinc-900 px-4 py-3 text-center text-[15px] text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
