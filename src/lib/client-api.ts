import type { EventDetail, EventRow, EventType, UnitSnapshot } from "./state";

export interface Unit {
  id: string;
  consignmentId: string;
  unitNumber: string;
  dinKey: string;
  facility: string;
  collectionYear: string;
  serial: string;
  productCode: string;
  aboRh: string;
  expires: string;
}

export interface Consignment {
  id: string;
  location: string;
  bloodBankRef: string | null;
  issuedBy: string;
  issuedAt: string;
  stockMovedInWellsky: boolean;
  uncrossmatchedStickerAffixed: boolean;
  qaReviewedBy: string | null;
  qaReviewedAt: string | null;
}

export interface Medic {
  id: string;
  name: string;
  active: boolean;
}

export interface UnitWithSnapshot {
  unit: Unit;
  snapshot: UnitSnapshot;
  eventCount: number;
}

export interface UnitDetail {
  unit: Unit;
  snapshot: UnitSnapshot;
  events: EventRow[];
  legalActions: EventType[];
}

export interface NewUnitInput {
  id: string;
  unitNumber: string;
  facility: string;
  collectionYear: string;
  serial: string;
  productCode: string;
  aboRh: string;
  expires: string;
}

export interface NewConsignmentInput {
  id: string;
  location: string;
  bloodBankRef?: string;
  issuedBy: string;
  issuedAt: string;
  medicId: string;
  units: NewUnitInput[];
}

class ApiError extends Error {}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  consignments: () => fetch("/api/consignments").then((r) => json<Consignment[]>(r)),
  units: () => fetch("/api/units").then((r) => json<UnitWithSnapshot[]>(r)),
  unit: (id: string) => fetch(`/api/units/${id}`).then((r) => json<UnitDetail>(r)),
  medics: () => fetch("/api/medics").then((r) => json<Medic[]>(r)),

  verifyPin: (pin: string) =>
    fetch("/api/medics/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    }).then((r) => json<{ ok: boolean; medic?: { id: string; name: string } }>(r)),

  logEvents: (body: {
    medicId: string;
    pin: string;
    at: string;
    batchId?: string;
    entries: { unitId: string; type: EventType; detail?: EventDetail }[];
  }) =>
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<{ batchId: string | null; eventIds: number[] }>(r)),

  issueConsignment: (body: NewConsignmentInput) =>
    fetch("/api/consignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<{ id: string; batchId: string }>(r)),
};

export { ApiError };
