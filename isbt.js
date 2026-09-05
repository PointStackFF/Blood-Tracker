/* ------------------------------------------------------------------ *
 * ISBT-128 unit number parsing
 *
 * Cold chain only needs to know which unit. The product code, ABO/Rh and
 * expiry barcodes are recognized but not stored — they exist here purely
 * so that scanning the wrong barcode gives a useful message instead of
 * "unrecognized". They sit within an inch of each other on the label.
 *
 * The raw payload is always kept alongside the parsed form. If the blood
 * bank later tells us a field we ignored is meaningful, we re-derive from
 * stored data rather than rescanning.
 * ------------------------------------------------------------------ */

function clean(payload) {
  return String(payload)
    .replace(/[\x00-\x1f\x7f]/g, "")   // group separators etc.
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
export function parseDIN(payload) {
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
    key: `${facility}${year}${serial}`,          // flags excluded on purpose
    display: `${facility} ${year} ${serial}`,     // as the blood bank writes it
  };
}

/* The other barcodes on the label, identified only to redirect the medic. */
const OTHERS = [
  [/^=</, "product code"],
  [/^=%/, "ABO/Rh"],
  [/^=&/, "expiration date"],
];

/**
 * Resolve a scan against the units currently on hand.
 * Returns { ok: true, unit, din } or { ok: false, message } — the message
 * is written for the person holding the bag, not for a log.
 */
export function resolveScan(payload, units) {
  const raw = clean(payload);
  const din = parseDIN(raw);

  if (din) {
    const hit = units.find(
      (u) => String(u.unitNumber).replace(/\s+/g, "").toUpperCase() === din.key
    );
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

/* ---- Tests ---- */
export function selfTest() {
  const units = [
    { id: "UA", unitNumber: "W1833 26 313043" },
    { id: "UB", unitNumber: "W1833 26 337371" },
  ];
  const t = [];
  const push = (name, cond) => t.push({ name, pass: !!cond });

  const a = resolveScan("=W18332633737100", units);
  push("matches UB", a.ok && a.unit.id === "UB");

  const b = resolveScan("=W18332633737101", units);
  push("division still matches", b.ok && b.unit.id === "UB");

  const c = resolveScan("W183326313043", units);
  push("no identifier, no flags", c.ok && c.unit.id === "UA");

  const c2 = resolveScan("=W1833263130430", units);
  push("single stray digit rejected", !c2.ok);

  const d = resolveScan("=W18332699999900", units);
  push("unknown unit rejected", !d.ok && /isn't part of this consignment/.test(d.message));

  const e = resolveScan("=<E0336V00", units);
  push("product code redirects", !e.ok && /product code/.test(e.message));

  const f = resolveScan("=W1833263373710\x1d0", units);
  push("control chars stripped", f.ok && f.unit.id === "UB");

  const g = resolveScan("hello", units);
  push("garbage rejected", !g.ok);

  return t;
}
