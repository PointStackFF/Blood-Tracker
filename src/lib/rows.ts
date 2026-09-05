import type { EventRow } from "./state";

// Raw shapes as they come back from `pg` (snake_case columns).
export interface EventRowDb {
  id: number;
  unit_id: string;
  type: EventRow["type"];
  at: Date;
  medic_id: string;
  batch_id: string | null;
  detail: EventRow["detail"];
  captured_offline: boolean;
}

export function toEventRow(row: EventRowDb): EventRow {
  return {
    id: row.id,
    unitId: row.unit_id,
    type: row.type,
    at: row.at.toISOString(),
    medicId: row.medic_id,
    batchId: row.batch_id,
    detail: row.detail,
    capturedOffline: row.captured_offline,
  };
}

export interface UnitRowDb {
  id: string;
  consignment_id: string;
  unit_number: string;
  din_key: string;
  facility: string;
  collection_year: string;
  serial: string;
  product_code: string;
  abo_rh: string;
  expires: Date;
}

export function toUnit(row: UnitRowDb) {
  return {
    id: row.id,
    consignmentId: row.consignment_id,
    unitNumber: row.unit_number,
    dinKey: row.din_key,
    facility: row.facility,
    collectionYear: row.collection_year,
    serial: row.serial,
    productCode: row.product_code,
    aboRh: row.abo_rh,
    expires: row.expires.toISOString(),
  };
}

export interface ConsignmentRowDb {
  id: string;
  location: string;
  blood_bank_ref: string | null;
  issued_by: string;
  issued_at: Date;
  stock_moved_in_wellsky: boolean;
  uncrossmatched_sticker_affixed: boolean;
  qa_reviewed_by: string | null;
  qa_reviewed_at: Date | null;
}

export function toConsignment(row: ConsignmentRowDb) {
  return {
    id: row.id,
    location: row.location,
    bloodBankRef: row.blood_bank_ref,
    issuedBy: row.issued_by,
    issuedAt: row.issued_at.toISOString(),
    stockMovedInWellsky: row.stock_moved_in_wellsky,
    uncrossmatchedStickerAffixed: row.uncrossmatched_sticker_affixed,
    qaReviewedBy: row.qa_reviewed_by,
    qaReviewedAt: row.qa_reviewed_at ? row.qa_reviewed_at.toISOString() : null,
  };
}
