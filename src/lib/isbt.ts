/* ------------------------------------------------------------------ *
 * ISBT-128 unit number parsing — TypeScript port of isbt.js.
 *
 * Cold chain only needs to know which unit. The product code, ABO/Rh and
 * expiry barcodes are recognized but not stored — they exist here purely
 * so that scanning the wrong barcode gives a useful message instead of
 * "unrecognized". They sit within an inch of each other on the label.
 * ------------------------------------------------------------------ */

export interface Din {
  raw: string;
  facility: string;
  year: string;
  serial: string;
  flags: string;
  divided: boolean;
  key: string; // facility+year+serial — flags excluded on purpose
  display: string; // as the blood bank writes it
}

function clean(payload: string): string {
  return String(payload)
    .replace(/[\x00-\x1f\x7f]/g, "") // group separators etc.
    .trim();
}

/* Donation Identification Number — the one we care about.
 *
 *   Printed:  W1833 26 337371 8[5]
 *   Scanned:  =W18332633737100
 *
 *   =        data identifier
 *   W1833    facility
 *   26       collection year
 *   337371   serial
 *   00       flag characters; 00 on an undivided unit
 *
 * The 8 and boxed 5 are manual-entry check characters computed from the
 * number. They are not in the barcode.
 */
export function parseDIN(payload: string): Din | null {
  const raw = clean(payload);
  const m = raw.replace(/^=/, "").match(/^([A-Z]\d{4})(\d{2})(\d{6})(\d{2})?$/);
  if (!m) return null;

  const [, facility, year, serial, flags = ""] = m;
  return {
    raw,
    facility,
    year,
    serial,
    flags,
    divided: flags !== "" && flags !== "00",
    key: `${facility}${year}${serial}`,
    display: `${facility} ${year} ${serial}`,
  };
}

/** Derives the same match key isbt.js uses, from stored unit fields. */
export function dinKey(facility: string, year: string, serial: string): string {
  return `${facility}${year}${serial}`;
}

const OTHERS: [RegExp, string][] = [
  [/^=</, "product code"],
  [/^=%/, "ABO/Rh"],
  [/^=&/, "expiration date"],
];

export interface ScanUnit {
  id: string;
  dinKey: string;
}

export type ScanResult<U extends ScanUnit> =
  | { ok: true; unit: U; din: Din }
  | { ok: false; message: string; din?: Din };

/**
 * Resolve a scan against the units currently on hand.
 * The message is written for the person holding the bag, not for a log.
 */
export function resolveScan<U extends ScanUnit>(
  payload: string,
  units: U[]
): ScanResult<U> {
  const raw = clean(payload);
  const din = parseDIN(raw);

  if (din) {
    const hit = units.find((u) => u.dinKey === din.key);
    if (hit) return { ok: true, unit: hit, din };
    return {
      ok: false,
      message: `Unit ${din.display} isn't part of this consignment.`,
      din,
    };
  }

  for (const [pattern, what] of OTHERS) {
    if (pattern.test(raw)) {
      return {
        ok: false,
        message: `That's the ${what} barcode. Scan the long one at the top of the label.`,
      };
    }
  }

  return { ok: false, message: "That isn't an ISBT label barcode." };
}
