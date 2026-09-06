"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TERMINAL, type UnitSnapshot } from "@/lib/state";
import {
  ApiError,
  api,
  type Consignment,
  type Medic,
  type NewConsignmentInput,
  type Unit,
  type UnitDetail,
  type UnitWithSnapshot,
} from "@/lib/client-api";
import { Button, UnitTag, elapsed, hhmm, mdy } from "./_components/ui";
import {
  PackIn,
  PackOut,
  ReceiveConsignment,
  RestockBase,
  RotateTic,
  UnitScreen,
  type Entry,
} from "./_components/flows";
import { LogScreen, type LogRow } from "./_components/log";

type View = "home" | "packout" | "packin" | "rotate" | "unit" | "log" | "receive" | "restock";

const LOCATIONS = ["MacArthur Airport", "Gabreski Airport"] as const;
const LOCATION_STORAGE_KEY = "blood-tracker-location";

export default function App() {
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [location, setLocationState] = useState<string | null>(null);
  const [locationLoaded, setLocationLoaded] = useState(false);
  const [units, setUnits] = useState<UnitWithSnapshot[]>([]);
  const [unitDetails, setUnitDetails] = useState<Record<string, UnitDetail>>({});
  const [medics, setMedics] = useState<Medic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [view, setView] = useState<View>("home");
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser-only API, can't happen during render
    if (stored) setLocationState(stored);
    setLocationLoaded(true);
  }, []);

  const setLocation = useCallback((next: string | null) => {
    setLocationState(next);
    if (next) window.localStorage.setItem(LOCATION_STORAGE_KEY, next);
    else window.localStorage.removeItem(LOCATION_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshAll = useCallback(async () => {
    const [consignmentsList, unitsList, medicsList] = await Promise.all([
      api.consignments(),
      api.units(),
      api.medics(),
    ]);
    setConsignments(consignmentsList);
    setUnits(unitsList);
    setMedics(medicsList);
    const details = await Promise.all(unitsList.map((u) => api.unit(u.unit.id)));
    setUnitDetails(Object.fromEntries(details.map((d) => [d.unit.id, d])));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount, not a render loop
    refreshAll()
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [refreshAll]);

  const medicName = useCallback(
    (id: string) => medics.find((m) => m.id === id)?.name ?? id,
    [medics]
  );

  const snaps: Record<string, UnitSnapshot> = useMemo(
    () => Object.fromEntries(units.map((u) => [u.unit.id, u.snapshot])),
    [units]
  );

  // The medic app is scoped to one hangar location at a time, chosen by the
  // medic (not inferred) — a flight medic working MacArthur never touches
  // Gabreski's inventory. Multiple consignments can be simultaneously
  // relevant at one location (the original plus a hospital-issued
  // replacement mid-swap).
  const relevantConsignments = useMemo(
    () => consignments.filter((c) => c.location === location),
    [consignments, location]
  );
  const relevantIds = useMemo(
    () => new Set(relevantConsignments.map((c) => c.id)),
    [relevantConsignments]
  );
  const unitList: Unit[] = useMemo(
    () => units.map((u) => u.unit).filter((u) => relevantIds.has(u.consignmentId)),
    [units, relevantIds]
  );
  const activeConsignments = useMemo(
    () =>
      relevantConsignments.filter((c) =>
        unitList.some((u) => u.consignmentId === c.id && !TERMINAL.includes(snaps[u.id]?.state))
      ),
    [relevantConsignments, unitList, snaps]
  );
  const inFridge = unitList.filter((u) => snaps[u.id]?.state === "IN_FRIDGE");
  const inCooler = unitList.filter((u) => snaps[u.id]?.state === "IN_COOLER");
  const open = unitList.filter((u) => !TERMINAL.includes(snaps[u.id]?.state));
  const packOut = inCooler.length > 0;
  const pack = packOut ? snaps[inCooler[0].id] : null;
  // The current pack's total is scoped to whichever consignment is out
  // right now, not every unit this location has ever seen — a location
  // can carry units from more than one consignment across its history.
  const currentPackTotalUnits = packOut
    ? unitList.filter((u) => u.consignmentId === inCooler[0].consignmentId).length
    : inCooler.length;

  // Prefill for "Receive new consignment": the most recently-touched
  // known TIC/cooler among this location's units, so the medic isn't
  // re-typing a number that hasn't changed.
  const packContext = useMemo(() => {
    let best: { since: string; ticNo: string; cooler: string } | null = null;
    for (const u of unitList) {
      const snap = snaps[u.id];
      if (snap?.ticNo && snap?.cooler && snap?.since && (!best || snap.since > best.since)) {
        best = { since: snap.since, ticNo: snap.ticNo, cooler: snap.cooler };
      }
    }
    return best;
  }, [unitList, snaps]);
  const leftoverUnits = unitList.filter((u) => snaps[u.id]?.state === "IN_COOLER");

  const commit = useCallback(
    async (entries: Entry[], medic: { id: string; name: string }, pin: string, label: string) => {
      try {
        await api.logEvents({
          medicId: medic.id,
          pin,
          at: new Date().toISOString(),
          entries,
        });
        setToast(`${label} · signed by ${medic.name}`);
        setView("home");
        setActiveUnitId(null);
        await refreshAll();
      } catch (err) {
        setToast(err instanceof ApiError ? err.message : "Something went wrong logging that.");
      }
    },
    [refreshAll]
  );

  const commitConsignment = useCallback(
    async (
      consignmentInput: NewConsignmentInput,
      entries: Entry[],
      medic: { id: string; name: string },
      pin: string,
      label: string
    ) => {
      try {
        await api.issueConsignment(consignmentInput);
        await api.logEvents({
          medicId: medic.id,
          pin,
          at: new Date().toISOString(),
          entries,
        });
        setToast(`${label} · signed by ${medic.name}`);
        setView("home");
        setActiveUnitId(null);
        await refreshAll();
      } catch (err) {
        setToast(err instanceof ApiError ? err.message : "Something went wrong logging that.");
      }
    },
    [refreshAll]
  );

  const commitRestock = useCallback(
    async (
      oldUnitIds: string[],
      consignmentInput: Omit<NewConsignmentInput, "medicId">,
      medic: { id: string; name: string },
      pin: string,
      label: string
    ) => {
      try {
        await api.restock({
          oldUnitIds,
          consignment: consignmentInput,
          medicId: medic.id,
          pin,
          at: new Date().toISOString(),
        });
        setToast(`${label} · signed by ${medic.name}`);
        setView("home");
        setActiveUnitId(null);
        await refreshAll();
      } catch (err) {
        setToast(err instanceof ApiError ? err.message : "Something went wrong logging that.");
      }
    },
    [refreshAll]
  );

  const logRows: LogRow[] = useMemo(() => {
    const rows = Object.values(unitDetails).flatMap((d) =>
      d.events.map((event) => ({
        event,
        unitLabel: `${d.unit.id.slice(1)} · ${d.unit.unitNumber.slice(-7)}`,
        medicName: medicName(event.medicId),
      }))
    );
    rows.sort((a, b) => a.event.at.localeCompare(b.event.at) || a.event.id - b.event.id);
    return rows;
  }, [unitDetails, medicName]);

  if (loading || !locationLoaded) {
    return <div className="p-8 text-center text-zinc-500">Loading…</div>;
  }
  if (loadError || consignments.length === 0) {
    return (
      <div className="p-8 text-center text-rose-700">
        {loadError || "No consignment found — run `npm run db:seed`."}
      </div>
    );
  }

  if (!location) {
    return (
      <div className="min-h-screen bg-zinc-100 font-sans text-zinc-900">
        <div className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center bg-zinc-50 px-5 shadow-sm">
          <h1 className="text-[22px] font-semibold tracking-tight">Which base?</h1>
          <p className="mt-1 text-[16px] leading-relaxed text-zinc-600">
            This stays set on this phone until you switch it.
          </p>
          <div className="mt-6 space-y-3">
            {LOCATIONS.map((loc) => (
              <Button key={loc} onClick={() => setLocation(loc)}>
                {loc}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeUnit = activeUnitId ? unitList.find((u) => u.id === activeUnitId) ?? null : null;
  const headerConsignments = activeConsignments.length > 0 ? activeConsignments : relevantConsignments.slice(0, 1);

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-zinc-900">
      <div className="mx-auto min-h-screen max-w-[480px] bg-zinc-50 shadow-sm">
        <header className="border-b border-zinc-200 bg-white px-5 pb-4 pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[20px] font-semibold tracking-tight">{location}</div>
            <button
              onClick={() => setLocation(null)}
              className="text-[13px] font-medium text-zinc-400 hover:text-zinc-700"
            >
              Switch base
            </button>
          </div>
          {headerConsignments.map((c) => (
            <div key={c.id} className="mt-0.5 text-[14px] text-zinc-500">
              Consignment {c.id} · issued {mdy(new Date(c.issuedAt))} by {c.issuedBy}
            </div>
          ))}
        </header>

        {view === "home" && (
          <div className="px-5 pb-10 pt-5">
            {packOut && pack ? (
              <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-300">
                <div className="flex items-baseline justify-between">
                  <div className="text-[15px] font-medium text-amber-900">
                    Pack out · TIC {pack.ticNo} in cooler {pack.cooler}
                  </div>
                  {pack.since && (
                    <div className="text-[13px] text-amber-800">since {hhmm(new Date(pack.since))}</div>
                  )}
                </div>
                {pack.since && (
                  <div className="mt-2 font-mono text-[44px] leading-none tracking-tight text-amber-800">
                    {elapsed(pack.since, now)}
                  </div>
                )}
                <div className="mt-2 text-[14px] text-amber-900">
                  {inCooler.length === 1 ? "1 unit travelling" : `${inCooler.length} units travelling`}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-300">
                <div className="text-[15px] font-medium text-zinc-900">Pack in the fridge</div>
                <div className="mt-1 text-[15px] leading-relaxed text-zinc-600">
                  {inFridge.length > 0
                    ? `${inFridge.length} unit${inFridge.length > 1 ? "s" : ""} stored and ready.`
                    : "Nothing left in storage here."}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-4">
              {unitList.map((u) => (
                <UnitTag
                  key={u.id}
                  unit={u}
                  snap={snaps[u.id]}
                  now={now}
                  onClick={() => {
                    setActiveUnitId(u.id);
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
              <Button variant="quiet" onClick={() => setView("receive")}>
                Receive new consignment
              </Button>
              <Button variant="quiet" onClick={() => setView("restock")}>
                Restock this base
              </Button>
              <Button variant="quiet" onClick={() => setView("log")}>
                View custody log
              </Button>
            </div>

            <div className="mt-6 text-[14px] leading-relaxed text-zinc-500">
              {unitList.length === 0
                ? "No consignment on hand at this location right now."
                : open.length === 0
                  ? "Every unit in this consignment has been accounted for."
                  : `${open.length} of ${unitList.length} units still open. The blood bank sees this in real time.`}
            </div>
          </div>
        )}

        {view === "packout" && (
          <PackOut units={inFridge} now={now} onCommit={commit} onBack={() => setView("home")} />
        )}

        {view === "packin" && (
          <PackIn
            units={inCooler}
            packTic={pack?.ticNo ?? null}
            now={now}
            onCommit={commit}
            onBack={() => setView("home")}
            totalUnits={currentPackTotalUnits}
          />
        )}

        {view === "rotate" && (
          <RotateTic
            units={inCooler}
            packTic={pack?.ticNo ?? null}
            now={now}
            onCommit={commit}
            onBack={() => setView("home")}
          />
        )}

        {view === "unit" && activeUnit && (
          <UnitScreen
            unit={activeUnit}
            snap={snaps[activeUnit.id]}
            now={now}
            onCommit={commit}
            onBack={() => {
              setActiveUnitId(null);
              setView("home");
            }}
          />
        )}

        {view === "log" && <LogScreen rows={logRows} onBack={() => setView("home")} />}

        {view === "receive" && location && (
          <ReceiveConsignment
            location={location}
            leftoverUnits={leftoverUnits}
            nextSeq={relevantConsignments.length + 1}
            prefillTic={packContext?.ticNo ?? null}
            prefillCooler={packContext?.cooler ?? null}
            now={now}
            onCommit={commitConsignment}
            onBack={() => setView("home")}
          />
        )}

        {view === "restock" && location && (
          <RestockBase
            location={location}
            oldUnits={inFridge}
            nextSeq={relevantConsignments.length + 1}
            now={now}
            onCommit={commitRestock}
            onBack={() => setView("home")}
          />
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-30 mx-auto w-[min(440px,90vw)] rounded-xl bg-zinc-900 px-4 py-3 text-center text-[15px] text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
