"use client";

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { UnitSnapshot, UnitState } from "@/lib/state";
import type { Unit } from "@/lib/client-api";
import { parsePrintedUnitNumber, resolveScan } from "@/lib/isbt";
import { Scanner } from "./scanner";

export const STATE_LABEL: Record<UnitState, string> = {
  IN_FRIDGE: "In fridge",
  IN_COOLER: "Out with the pack",
  QUARANTINE: "Quarantined",
  TRANSFUSED: "Transfused",
  DISCARDED: "Discarded",
  RETURNED_BB: "Returned to blood bank",
};

type Tone = "sky" | "amber" | "rose" | "zinc";

const STATE_TONE: Record<UnitState, Tone> = {
  IN_FRIDGE: "sky",
  IN_COOLER: "amber",
  QUARANTINE: "rose",
  TRANSFUSED: "zinc",
  DISCARDED: "zinc",
  RETURNED_BB: "zinc",
};

const TONE: Record<Tone, { chip: string; bar: string }> = {
  sky: { chip: "bg-sky-100 text-sky-900 ring-sky-300", bar: "bg-sky-500" },
  amber: { chip: "bg-amber-100 text-amber-900 ring-amber-400", bar: "bg-amber-500" },
  rose: { chip: "bg-rose-100 text-rose-900 ring-rose-400", bar: "bg-rose-500" },
  zinc: { chip: "bg-zinc-200 text-zinc-700 ring-zinc-300", bar: "bg-zinc-400" },
};

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
export const mdy = (d: Date) =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(2)}`;

export function elapsed(fromIso: string, now: number): string {
  const ms = now - new Date(fromIso).getTime();
  if (ms < 0) return "00:00";
  const m = Math.floor(ms / 60000);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const daysLeft = (iso: string, now: number) =>
  Math.ceil((new Date(iso).getTime() - now) / 86400000);

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-medium ring-1 ${TONE[tone].chip}`}
    >
      {children}
    </span>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "quiet";
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "w-full rounded-xl px-5 py-4 text-[17px] font-semibold transition active:scale-[.99] disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300";
  const styles: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800",
    danger: "bg-rose-700 text-white hover:bg-rose-600",
    quiet: "bg-white text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-50",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="text-[16px] font-medium text-zinc-900">{label}</div>
      {hint && <div className="mt-0.5 text-[14px] text-zinc-500">{hint}</div>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function Toggle({
  value,
  onChange,
}: {
  value: "pass" | "fail" | null;
  onChange: (v: "pass" | "fail") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["pass", "fail"] as const).map((v) => (
        <button
          key={v}
          type="button"
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

export function NumInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      inputMode="numeric"
      className="w-full rounded-xl border border-zinc-300 px-4 py-3 font-mono text-[18px] focus:border-zinc-900 focus:outline-none"
      {...props}
    />
  );
}

export function UnitTag({
  unit,
  snap,
  now,
  onClick,
  showClock,
}: {
  unit: Unit;
  snap: UnitSnapshot;
  now: number;
  onClick?: () => void;
  showClock?: boolean;
}) {
  const tone = STATE_TONE[snap.state];
  const left = daysLeft(unit.expires, now);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="block w-full rounded-2xl text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-300"
    >
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-300">
        <div className={`h-1.5 w-full ${TONE[tone].bar}`} />
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold tracking-wide text-zinc-500">
              Unit {unit.id.slice(1)}
            </span>
            <Chip tone={tone}>{STATE_LABEL[snap.state]}</Chip>
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
          {showClock && snap.state === "IN_COOLER" && snap.since && (
            <div className="mt-3 border-t border-zinc-200 pt-3 text-[14px] text-zinc-500">
              Out since {hhmm(new Date(snap.since))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function ScanRow({
  unit,
  scanned,
  onScan,
}: {
  unit: Unit;
  scanned: boolean;
  onScan: () => void;
}) {
  const [scanning, setScanning] = useState(false);

  const validate = (raw: string) => {
    const r = resolveScan(raw, [{ id: unit.id, dinKey: unit.dinKey }]);
    if (r.ok) return { ok: true as const, value: undefined };
    return { ok: false as const, message: r.message };
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (scanned ? onScan() : setScanning(true))}
        className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 ring-1 transition ${
          scanned ? "bg-emerald-50 ring-emerald-400" : "bg-white ring-zinc-300 hover:bg-zinc-50"
        }`}
      >
        <div className="text-left">
          <div className="text-[13px] font-semibold text-zinc-500">Unit {unit.id.slice(1)}</div>
          <div className="font-mono text-[16px] text-zinc-900">{unit.unitNumber}</div>
        </div>
        <span className={`text-[15px] font-medium ${scanned ? "text-emerald-700" : "text-zinc-400"}`}>
          {scanned ? "Scanned" : "Scan"}
        </span>
      </button>
      {scanning && (
        <Scanner
          title={`Scan unit ${unit.id.slice(1)}`}
          hint={unit.unitNumber}
          validateScan={validate}
          validateManual={(raw) => {
            const din = parsePrintedUnitNumber(raw);
            if (!din) return { ok: false, message: "Doesn't look like a full unit number — check for a missing or extra digit." };
            return validate(`${din.key}00`);
          }}
          onAccepted={() => {
            setScanning(false);
            onScan();
          }}
          onCancel={() => setScanning(false)}
        />
      )}
    </>
  );
}

export function TicSwapPanel({
  fromTic,
  toTic,
  setToTic,
  onSwapped,
}: {
  fromTic: string;
  toTic: string;
  setToTic: (v: string) => void;
  onSwapped: () => void;
}) {
  const same = toTic.trim() && toTic.trim() === String(fromTic);
  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-300">
      <div className="text-[15px] font-medium text-amber-900">Rotate in a good insert</div>
      <p className="mt-1 text-[15px] leading-relaxed text-amber-900">
        TIC {fromTic || "—"} failed, not the blood. Swap it for a spare in the same cooler, then
        check the new one.
      </p>
      <input
        value={toTic}
        onChange={(e) => setToTic(e.target.value)}
        inputMode="numeric"
        placeholder="Replacement TIC number"
        className="mt-3 w-full rounded-xl border border-amber-300 bg-white px-4 py-3 font-mono text-[17px] focus:border-amber-900 focus:outline-none"
      />
      <button
        type="button"
        onClick={onSwapped}
        disabled={!toTic.trim() || !!same}
        className="mt-3 w-full rounded-xl bg-amber-900 px-4 py-3 text-[16px] font-semibold text-white hover:bg-amber-800 active:scale-[.99] disabled:opacity-40"
      >
        Insert swapped — check TIC {toTic.trim() || "—"}
      </button>
      {same && (
        <div className="mt-2 text-[14px] text-amber-900">
          That&apos;s the insert that just failed. Pick a different one.
        </div>
      )}
    </div>
  );
}

export function PinPad({
  summary,
  onCancel,
  onSigned,
}: {
  summary: string;
  onCancel: () => void;
  onSigned: (medic: { id: string; name: string }, pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const press = async (d: string) => {
    if (checking) return;
    setError("");
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setChecking(true);
      try {
        const res = await fetch("/api/medics/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: next }),
        });
        const body = await res.json();
        if (body.ok) {
          onSigned(body.medic, next);
        } else {
          setError("That PIN isn't recognized. Try again.");
          setPin("");
        }
      } catch {
        setError("Couldn't reach the server. Try again.");
        setPin("");
      } finally {
        setChecking(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-zinc-900/70 p-4 backdrop-blur-sm">
      <div className="mt-auto rounded-3xl bg-white p-6">
        <div className="text-[15px] text-zinc-500">Sign this entry</div>
        <div className="mt-1 text-[19px] font-semibold leading-snug text-zinc-900">{summary}</div>
        <div className="mt-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full ring-1 ring-zinc-400 ${i < pin.length ? "bg-zinc-900" : ""}`}
            />
          ))}
        </div>
        <div className="mt-3 h-5 text-center text-[14px] text-rose-700">{error}</div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className="rounded-xl bg-zinc-100 py-5 font-mono text-[24px] hover:bg-zinc-200 active:scale-[.98]"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl py-5 text-[16px] text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            className="rounded-xl bg-zinc-100 py-5 font-mono text-[24px] hover:bg-zinc-200 active:scale-[.98]"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin(pin.slice(0, -1))}
            className="rounded-xl py-5 text-[16px] text-zinc-600 hover:bg-zinc-100"
          >
            Delete
          </button>
        </div>
        <div className="mt-4 text-center text-[13px] text-zinc-500">
          Demo PINs: 4417 (K. Reagan) · 2280 (J. Marek)
        </div>
      </div>
    </div>
  );
}
